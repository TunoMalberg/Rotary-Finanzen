import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import * as XLSX from "xlsx";
import { autoCategoryName } from "@/lib/categorize";

function parseClubYearLabel(label: string) {
  if (!/^\d{4}\/\d{4}$/.test(label)) throw new Error("Format YYYY/YYYY");
  const [a, b] = label.split("/").map(Number);
  return { a, b, startsAt: new Date(Date.UTC(a, 6, 1)), endsAt: new Date(Date.UTC(b, 5, 30, 23, 59, 59)) };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  const yearLabel = String(fd.get("yearLabel") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  let bounds;
  try { bounds = parseClubYearLabel(yearLabel); } catch { return NextResponse.json({ error: "Label ungültig (Format: YYYY/YYYY)" }, { status: 400 }); }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

  const cy = await prisma.clubYear.upsert({
    where: { label: yearLabel },
    update: {},
    create: {
      label: yearLabel,
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
      isClosed: true,
    },
  });

  const main = await prisma.account.findFirst({ where: { type: "MAIN" } });
  const gg = await prisma.account.findFirst({ where: { type: "GLOBAL_GRANT_TRUST" } });
  const cats = await prisma.category.findMany();
  const catByName = new Map(cats.map((c) => [c.name, c.id]));

  let total = 0;
  for (const [sheetName, accountId] of [
    ["ERSTE Konto", main?.id],
    ["ERSTE Global Grant ", gg?.id],
    ["ERSTE Global Grant", gg?.id],
  ] as const) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !accountId) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i] as unknown[])?.[0] === "Datum") { headerIdx = i; break; }
    }
    if (headerIdx < 0) continue;
    let kontoCol = sheetName.includes("Global") ? 15 : 17;
    if (headerIdx > 0) {
      const above = rows[headerIdx - 1];
      if (Array.isArray(above)) {
        for (let i = 0; i < above.length; i++) {
          if (typeof above[i] === "string" && /KONTO/i.test(above[i] as string)) {
            kontoCol = i; break;
          }
        }
      }
    }
    // Blocktrennung Einnahmen-/Ausgaben-Spalten: Die Sektionszeile über dem
    // Header trägt "Ausgaben" am Beginn des Ausgabenblocks. Nur wenn dieser
    // Marker eindeutig gefunden wird, werden positive Werte im Ausgabenblock
    // negiert (historische Dateien tragen Ausgaben teils positiv ein).
    // Negative Ausgaben (App-Export-Format) bleiben immer negativ; ohne
    // eindeutigen Marker wird nichts verändert.
    let expenseStart = -1;
    if (headerIdx > 0) {
      const above = rows[headerIdx - 1];
      if (Array.isArray(above)) {
        for (let c = 5; c < kontoCol; c++) {
          const v = above[c];
          if (typeof v === "string" && /^ausgaben$/i.test((v as string).trim())) {
            expenseStart = c; break;
          }
        }
      }
    }
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] as (string | number | Date | null)[];
      const rawDate = r[0];
      if (!(rawDate instanceof Date) || isNaN(rawDate.getTime())) continue;
      // SheetJS (cellDates:true) liefert Server-Lokalzeit → auf UTC-Mitternacht
      // normalisieren, damit das gespeicherte Datum TZ-unabhängig stabil ist.
      const date = new Date(Date.UTC(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate()));
      const text = (r[1] as string) ?? "";
      const code = (r[2] as string) ?? null;
      const note = (r[3] as string) ?? null;
      let amount = 0;
      for (let c = 4; c < kontoCol; c++) {
        const v = r[c];
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        // Im Ausgabenblock positive Werte als Ausgabe (negativ) werten.
        amount += expenseStart >= 0 && c >= expenseStart && v > 0 ? -v : v;
      }
      if (amount === 0) continue;
      const cat = autoCategoryName({ purpose: `${text} ${note ?? ""}`, counterparty: text, code, amount });
      const categoryId = cat ? catByName.get(cat.name) ?? null : null;
      await prisma.transaction.create({
        data: {
          accountId,
          clubYearId: cy.id,
          date,
          counterparty: text || null,
          purpose: note,
          code,
          amount,
          categoryId,
          source: "ARCHIVE",
        },
      });
      total++;
    }
  }

  // Abschluß summary
  const ws = wb.Sheets["Abschluß"];
  if (ws) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const income: Record<string, number> = {};
    const expense: Record<string, number> = {};
    let mode: "INCOME" | "EXPENSE" | null = null;
    for (const r of rows) {
      const a = (r as unknown[])[0];
      if (typeof a === "string") {
        const s = a.trim();
        if (s === "EINNAHMEN") { mode = "INCOME"; continue; }
        if (s === "AUSGABEN") { mode = "EXPENSE"; continue; }
        if (mode && typeof (r as unknown[])[3] === "number") {
          if (mode === "INCOME") income[s] = (income[s] ?? 0) + ((r as unknown[])[3] as number);
          else expense[s] = (expense[s] ?? 0) + ((r as unknown[])[3] as number);
        }
      }
    }
    await prisma.archivedYear.upsert({
      where: { clubYearId: cy.id },
      update: { summaryJson: JSON.stringify({ income, expense }), fileName: file.name },
      create: { clubYearId: cy.id, summaryJson: JSON.stringify({ income, expense }), fileName: file.name, closedById: session?.user?.id },
    });
  }

  return NextResponse.json({ ok: true, label: cy.label, transactions: total });
}