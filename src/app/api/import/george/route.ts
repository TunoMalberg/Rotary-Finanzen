import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { parseCSV } from "@/lib/csvParse";
import { autoCategoryName } from "@/lib/categorize";
import { parseGermanNumber } from "@/lib/format";

function findCol(headers: string[], candidates: string[]) {
  const norm = headers.map((h) => h.toLowerCase().replace(/\s+/g, ""));
  for (const c of candidates) {
    const idx = norm.indexOf(c.toLowerCase().replace(/\s+/g, ""));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // dd.MM.yyyy or dd/MM/yyyy or yyyy-MM-dd
  const m1 = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m1) {
    const d = Number(m1[1]), mo = Number(m1[2]), y = m1[3].length === 2 ? 2000 + Number(m1[3]) : Number(m1[3]);
    return new Date(Date.UTC(y, mo - 1, d));
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3])));
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const fd = await req.formData();
  const file = fd.get("file");
  const accountId = String(fd.get("accountId") ?? "");
  const clubYearId = String(fd.get("clubYearId") ?? "");
  const dryRun = String(fd.get("dryRun") ?? "") === "true";
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (!accountId || !clubYearId) return NextResponse.json({ error: "accountId/clubYearId fehlen" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return NextResponse.json({ error: "Datei enthält keine Daten" }, { status: 400 });
  const headers = rows[0].map((h) => h.trim());

  const dateIdx = findCol(headers, ["Buchungsdatum", "Buchungstag", "Datum", "Datum Buchung", "Buchung"]);
  const valueIdx = findCol(headers, ["Valutadatum", "Valuta", "Wertstellung"]);
  const amountIdx = findCol(headers, ["Betrag", "Umsatz", "Wert"]);
  const purposeIdx = findCol(headers, ["Verwendungszweck", "Buchungstext", "Text", "Zahlungsreferenz"]);
  const counterpartyIdx = findCol(headers, ["Auftraggeber", "Empfänger", "Begünstigter", "Gegenpartei", "Empfaenger", "Beguenstigter", "Empfänger/Auftraggeber", "Auftraggeber/Empfänger"]);
  const ibanIdx = findCol(headers, ["IBAN", "Gegenkonto", "Konto Empfänger"]);
  const currencyIdx = findCol(headers, ["Währung", "Currency", "Waehrung"]);

  if (dateIdx < 0 || amountIdx < 0) {
    return NextResponse.json({ error: "Spalten 'Datum'/'Betrag' nicht gefunden", headers }, { status: 400 });
  }

  const cats = await prisma.category.findMany();
  const catByName = new Map(cats.map((c) => [c.name, c.id]));
  const members = await prisma.member.findMany({ select: { id: true, lastName: true } });

  let batchId: string | null = null;
  if (!dryRun) {
    const batch = await prisma.importBatch.create({
      data: {
        accountId,
        fileName: (file as File).name,
        importedById: session?.user?.id,
        rowCount: rows.length - 1,
      },
    });
    batchId = batch.id;
  }

  const result: Array<{
    date: string; counterparty: string | null; purpose: string | null; amount: number;
    category?: string | null; isDuplicate: boolean; matchedMember?: string | null;
  }> = [];
  let created = 0, duplicates = 0, autoMatched = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c?.trim())) continue;
    const date = parseDate(r[dateIdx]);
    const amount = parseGermanNumber(r[amountIdx] ?? "");
    if (!date || amount === 0) continue;
    const purpose = purposeIdx >= 0 ? (r[purposeIdx] ?? "").trim() : "";
    const counterparty = counterpartyIdx >= 0 ? (r[counterpartyIdx] ?? "").trim() : "";
    // Currency check (skip non-EUR)
    if (currencyIdx >= 0) {
      const cur = (r[currencyIdx] ?? "").trim().toUpperCase();
      if (cur && cur !== "EUR") continue;
    }

    // Duplicate detection
    const dup = await prisma.transaction.findFirst({
      where: {
        accountId,
        date,
        amount,
        purpose: purpose || null,
        deletedAt: null,
      },
    });
    if (dup) {
      duplicates++;
      result.push({
        date: date.toISOString(),
        counterparty: counterparty || null,
        purpose: purpose || null,
        amount,
        isDuplicate: true,
      });
      continue;
    }

    const cat = autoCategoryName({ purpose, counterparty, code: null, amount });
    const categoryId = cat ? catByName.get(cat.name) ?? null : null;

    // Member match
    let memberId: string | null = null;
    let memberName: string | null = null;
    const hay = `${counterparty} ${purpose}`.toLowerCase();
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
          date,
          valueDate: valueIdx >= 0 ? parseDate(r[valueIdx] ?? "") : null,
          counterparty: counterparty || null,
          purpose: purpose || null,
          code: ibanIdx >= 0 ? (r[ibanIdx] ?? "").trim() || null : null,
          amount,
          categoryId,
          memberId,
          source: "IMPORT",
          importBatchId: batchId,
        },
      });
      // try invoice match
      if (memberId && amount > 0) {
        const inv = await prisma.invoice.findFirst({
          where: {
            memberId, clubYearId, status: { in: ["OPEN", "REMINDED"] },
            amount: amount,
          },
        });
        if (inv) {
          await prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date(), paidTransactionId: txn.id } });
          autoMatched++;
        }
      }
    }
    created++;
    result.push({
      date: date.toISOString(),
      counterparty: counterparty || null,
      purpose: purpose || null,
      amount,
      category: cat?.name ?? null,
      isDuplicate: false,
      matchedMember: memberName,
    });
  }

  return NextResponse.json({ created, duplicates, autoMatched, dryRun, preview: result.slice(0, 100), totalRows: rows.length - 1 });
}