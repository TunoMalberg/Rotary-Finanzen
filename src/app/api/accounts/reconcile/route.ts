import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { parseBankFile } from "@/lib/bankImport";

/**
 * POST /api/accounts/reconcile
 * Vollabgleich einer hochgeladenen Bank-Datei (CSV/XLSX) gegen die
 * vorhandenen Buchungen eines Kontos.
 *
 * Body (multipart/form-data):
 *   file        – CSV oder XLSX
 *   accountId   – Hauptkonto/GG
 *   clubYearId  – das Clubjahr, gegen das verglichen wird (Buchungsdatum
 *                 muss in dieses Jahr fallen)
 *
 * Antwort:
 *   bankRows               – Anzahl Zeilen in Datei
 *   dbRows                 – Anzahl Buchungen DB im Jahr
 *   matched                – exakte 1:1-Treffer (über externalRef oder
 *                            date+amount+purpose)
 *   missingInDb            – in Datei, aber nicht in DB
 *   surplusInDb            – in DB, aber nicht in Datei
 *   bankSum                – Summe aller Bewegungen lt. Datei
 *   dbSum                  – Summe aller Bewegungen lt. DB
 *   openingBalance         – Anfangssaldo des Clubjahres (aus DB)
 *   bankClosing            – computed Endsaldo nach Datei (Opening + bankSum)
 *   dbClosing              – computed Endsaldo nach DB     (Opening + dbSum)
 *   diff                   – dbClosing − bankClosing
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  const accountId = String(fd.get("accountId") ?? "");
  const clubYearId = String(fd.get("clubYearId") ?? "");
  if (!(file instanceof File))
    return NextResponse.json({ error: "no file" }, { status: 400 });
  if (!accountId || !clubYearId)
    return NextResponse.json({ error: "accountId/clubYearId fehlen" }, { status: 400 });

  let parseResult;
  try {
    parseResult = await parseBankFile(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Datei konnte nicht gelesen werden." },
      { status: 400 },
    );
  }
  const { rows: bankRowsAll, source, headers } = parseResult;

  // Konto-/Jahres-Eckdaten
  const [account, cy] = await Promise.all([
    prisma.account.findUnique({ where: { id: accountId } }),
    prisma.clubYear.findUnique({ where: { id: clubYearId } }),
  ]);
  if (!account) return NextResponse.json({ error: "Konto unbekannt" }, { status: 404 });
  if (!cy) return NextResponse.json({ error: "Clubjahr unbekannt" }, { status: 404 });

  const opening = account.type === "MAIN" ? cy.openingBalanceMain : cy.openingBalanceGG;
  const yrStart = cy.startsAt.getTime();
  const yrEnd = cy.endsAt.getTime();

  // Filter Bank-Zeilen aufs Clubjahr
  const bankRows = bankRowsAll.filter(
    (r) => r.currency === "EUR" && r.date.getTime() >= yrStart && r.date.getTime() <= yrEnd,
  );

  // DB-Buchungen
  const dbTxs = await prisma.transaction.findMany({
    where: { accountId, clubYearId, deletedAt: null },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      amount: true,
      counterparty: true,
      purpose: true,
      externalRef: true,
      source: true,
      categoryId: true,
    },
  });

  type Match = { bankIndex: number; dbId: string; via: "ref" | "date+amount+purpose" | "date+amount" };
  const matches: Match[] = [];
  const usedDbIds = new Set<string>();
  const usedBankIdx = new Set<number>();

  // Pass 1: externalRef PLUS amount + purpose
  // (mehrere Bank-Zeilen können dieselbe Buchungsreferenz teilen, etwa
  // Quartalsspesen — daher zwingend zusätzliche Kriterien).
  const dbByRefKey = new Map<string, string>();
  const refKey = (ref: string, amount: number, purpose: string | null) =>
    `${ref}|${amount.toFixed(2)}|${(purpose ?? "").trim()}`;
  for (const t of dbTxs) {
    if (t.externalRef) dbByRefKey.set(refKey(t.externalRef, t.amount, t.purpose), t.id);
  }
  bankRows.forEach((br, i) => {
    if (!br.externalRef) return;
    const id = dbByRefKey.get(refKey(br.externalRef, br.amount, br.purpose));
    if (id && !usedDbIds.has(id)) {
      matches.push({ bankIndex: i, dbId: id, via: "ref" });
      usedDbIds.add(id);
      usedBankIdx.add(i);
    }
  });

  // helper for keys
  const keyDay = (d: Date) => d.toISOString().slice(0, 10);
  const keyAmount = (a: number) => a.toFixed(2);

  // Pass 2: date+amount+purpose (tolerant: trim/lowercase)
  const normalize = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  bankRows.forEach((br, i) => {
    if (usedBankIdx.has(i)) return;
    const k = `${keyDay(br.date)}|${keyAmount(br.amount)}|${normalize(br.purpose)}`;
    for (const t of dbTxs) {
      if (usedDbIds.has(t.id)) continue;
      const tk = `${keyDay(t.date)}|${keyAmount(t.amount)}|${normalize(t.purpose)}`;
      if (k === tk) {
        matches.push({ bankIndex: i, dbId: t.id, via: "date+amount+purpose" });
        usedDbIds.add(t.id);
        usedBankIdx.add(i);
        break;
      }
    }
  });

  // Pass 3: date+amount only
  bankRows.forEach((br, i) => {
    if (usedBankIdx.has(i)) return;
    const k = `${keyDay(br.date)}|${keyAmount(br.amount)}`;
    for (const t of dbTxs) {
      if (usedDbIds.has(t.id)) continue;
      const tk = `${keyDay(t.date)}|${keyAmount(t.amount)}`;
      if (k === tk) {
        matches.push({ bankIndex: i, dbId: t.id, via: "date+amount" });
        usedDbIds.add(t.id);
        usedBankIdx.add(i);
        break;
      }
    }
  });

  const missingInDb = bankRows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !usedBankIdx.has(i))
    .map(({ r }) => ({
      date: r.date.toISOString().slice(0, 10),
      counterparty: r.counterparty,
      purpose: r.purpose,
      amount: r.amount,
      externalRef: r.externalRef,
      partnerIban: r.partnerIban,
      valueDate: r.valueDate ? r.valueDate.toISOString().slice(0, 10) : null,
    }));

  const surplusInDb = dbTxs
    .filter((t) => !usedDbIds.has(t.id))
    .map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      counterparty: t.counterparty,
      purpose: t.purpose,
      amount: t.amount,
      externalRef: t.externalRef,
      sourceType: t.source,
    }));

  const bankSum = bankRows.reduce((s, r) => s + r.amount, 0);
  const dbSum = dbTxs.reduce((s, t) => s + t.amount, 0);
  const bankClosing = opening + bankSum;
  const dbClosing = opening + dbSum;

  return NextResponse.json({
    fileSource: source,
    fileHeaders: headers,
    bankRowsTotal: bankRowsAll.length,
    bankRowsInYear: bankRows.length,
    dbRows: dbTxs.length,
    matched: matches.length,
    matchByRef: matches.filter((m) => m.via === "ref").length,
    missingInDb,
    surplusInDb,
    opening,
    bankSum,
    dbSum,
    bankClosing,
    dbClosing,
    diff: dbClosing - bankClosing,
  });
}