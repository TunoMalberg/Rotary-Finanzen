import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { autoCategoryName } from "@/lib/categorize";
import { parseBankFile } from "@/lib/bankImport";

/**
 * POST /api/import/george
 * Bank-Import (George/Erste Bank) – akzeptiert CSV oder XLSX.
 *
 * Logik:
 * 1. Datei parsen (CSV oder XLSX, Format-Erkennung über Dateiname).
 * 2. Letzte vorhandene Buchung pro Konto ermitteln (max(date)).
 * 3. Zeilen, die strikt VOR dem Datum der letzten vorhandenen Buchung liegen,
 *    werden übersprungen ("skippedOlder"). So werden nur neue Buchungen
 *    seit dem letzten Import ergänzt.
 * 4. Für die übrigen Zeilen Duplikat-Erkennung:
 *      a) primär über `externalRef` (Bank-Buchungsreferenz),
 *      b) Fallback (date + amount + purpose) – für historische Buchungen
 *         ohne externalRef.
 * 5. Neue Buchungen werden angelegt, optional Mitglied/Forderung gematcht.
 *
 * Mit `dryRun=true` wird nur eine Vorschau erzeugt.
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
  const dryRun = String(fd.get("dryRun") ?? "") === "true";
  /** Wenn true → ALLE Zeilen importieren (kein Cutoff anhand letzter Buchung). */
  const importAll = String(fd.get("importAll") ?? "") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!accountId || !clubYearId) {
    return NextResponse.json({ error: "accountId/clubYearId fehlen" }, { status: 400 });
  }

  let parseResult;
  try {
    parseResult = await parseBankFile(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Datei konnte nicht gelesen werden." },
      { status: 400 },
    );
  }

  const { rows, source, headers } = parseResult;
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Keine importierbaren Zeilen gefunden.", headers, source },
      { status: 400 },
    );
  }

  // Letzte vorhandene Buchung des Kontos
  const lastTx = await prisma.transaction.findFirst({
    where: { accountId, deletedAt: null },
    orderBy: { date: "desc" },
    select: { id: true, date: true },
  });
  const lastDate: Date | null = lastTx?.date ?? null;

  // Stammdaten
  const [cats, members] = await Promise.all([
    prisma.category.findMany(),
    prisma.member.findMany({ select: { id: true, lastName: true } }),
  ]);
  const catByName = new Map(cats.map((c) => [c.name, c.id]));

  // ImportBatch (nur in echten Imports)
  let batchId: string | null = null;
  if (!dryRun) {
    const batch = await prisma.importBatch.create({
      data: {
        accountId,
        fileName: file.name,
        importedById: session?.user?.id,
        rowCount: rows.length,
      },
    });
    batchId = batch.id;
  }

  type PreviewRow = {
    date: string;
    counterparty: string | null;
    purpose: string | null;
    amount: number;
    category: string | null;
    isDuplicate: boolean;
    isSkippedOlder: boolean;
    matchedMember: string | null;
    externalRef: string | null;
  };

  const preview: PreviewRow[] = [];
  let created = 0;
  let duplicates = 0;
  let skippedOlder = 0;
  let autoMatched = 0;

  for (const r of rows) {
    if (r.currency && r.currency !== "EUR") continue;
    const isOlder = !!lastDate && r.date.getTime() < lastDate.getTime();
    const purpose = r.purpose ?? null;
    const counterparty = r.counterparty ?? null;
    const externalRef = r.externalRef ?? null;

    // Älter als letzte Buchung → skippen, außer importAll=true
    if (isOlder && !importAll) {
      skippedOlder++;
      preview.push({
        date: r.date.toISOString(),
        counterparty,
        purpose,
        amount: r.amount,
        category: null,
        isDuplicate: false,
        isSkippedOlder: true,
        matchedMember: null,
        externalRef,
      });
      continue;
    }

    // Duplikat-Erkennung
    let dup = null as { id: string } | null;
    if (externalRef) {
      dup = await prisma.transaction.findFirst({
        where: { accountId, externalRef, deletedAt: null },
        select: { id: true },
      });
    }
    if (!dup) {
      // Fallback: date + amount + purpose
      dup = await prisma.transaction.findFirst({
        where: {
          accountId,
          date: r.date,
          amount: r.amount,
          purpose: purpose,
          deletedAt: null,
        },
        select: { id: true },
      });
    }
    if (dup) {
      duplicates++;
      preview.push({
        date: r.date.toISOString(),
        counterparty,
        purpose,
        amount: r.amount,
        category: null,
        isDuplicate: true,
        isSkippedOlder: false,
        matchedMember: null,
        externalRef,
      });
      continue;
    }

    // Auto-Kategorisierung
    const cat = autoCategoryName({ purpose, counterparty, code: r.partnerIban, amount: r.amount });
    const categoryId = cat ? catByName.get(cat.name) ?? null : null;

    // Mitglieds-Match
    let memberId: string | null = null;
    let memberName: string | null = null;
    const hay = `${counterparty ?? ""} ${purpose ?? ""}`.toLowerCase();
    for (const m of members) {
      if (m.lastName && hay.includes(m.lastName.toLowerCase())) {
        memberId = m.id;
        memberName = m.lastName;
        break;
      }
    }

    if (!dryRun) {
      const txn = await prisma.transaction.create({
        data: {
          accountId,
          clubYearId,
          date: r.date,
          valueDate: r.valueDate,
          counterparty,
          purpose,
          code: r.partnerIban,
          amount: r.amount,
          categoryId,
          memberId,
          source: "IMPORT",
          importBatchId: batchId,
          externalRef,
        },
      });
      // Forderungs-Match (Mitgliedsbeitrag)
      if (memberId && r.amount > 0) {
        const inv = await prisma.invoice.findFirst({
          where: {
            memberId,
            clubYearId,
            status: { in: ["OPEN", "REMINDED"] },
            amount: r.amount,
          },
        });
        if (inv) {
          await prisma.invoice.update({
            where: { id: inv.id },
            data: { status: "PAID", paidAt: new Date(), paidTransactionId: txn.id },
          });
          autoMatched++;
        }
      }
    }

    created++;
    preview.push({
      date: r.date.toISOString(),
      counterparty,
      purpose,
      amount: r.amount,
      category: cat?.name ?? null,
      isDuplicate: false,
      isSkippedOlder: false,
      matchedMember: memberName,
      externalRef,
    });
  }

  return NextResponse.json({
    source,
    totalRows: rows.length,
    created,
    duplicates,
    skippedOlder,
    autoMatched,
    lastExistingDate: lastDate ? lastDate.toISOString() : null,
    importAll,
    dryRun,
    preview: preview.slice(0, 200),
  });
}