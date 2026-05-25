import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { parseEarWorkbookForImport, type ImportRow } from "@/lib/earExcel";
import { autoCategoryName } from "@/lib/categorize";

/**
 * POST /api/clubyears/:id/import
 *
 * Lädt eine im EAR-Format exportierte Excel-Datei wieder ein und gleicht die
 * Buchungen ab. Gedacht zur **Korrektur im Excel** (z. B. Schreibfehler in
 * Buchungstexten ausbessern, Kategorisierung manuell vornehmen).
 *
 * Modus:
 *   - `mode=preview` (default) → liefert nur Statistik (was würde sich
 *     ändern), ohne zu speichern.
 *   - `mode=commit`            → speichert tatsächlich.
 *
 * Optionen (FormData):
 *   - `deleteMissing=true` → Buchungen, die in der DB existieren, aber im
 *     Excel fehlen, werden Soft-Deleted (Audit-Trail). Default: false.
 *
 * Identifizierung der Zeilen:
 *   - Spalte „Anmerkung" am rechten Rand enthält bei Export die `Transaction.id`.
 *   - Falls die ID leer ist, wird per `accountId + date + amount + counterparty`
 *     gematcht; sonst neu angelegt.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const cy = await prisma.clubYear.findUnique({ where: { id } });
  if (!cy) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cy.lockedAt) {
    return NextResponse.json(
      { error: `Clubjahr ${cy.label} ist fixiert – Korrektur-Import nicht möglich.` },
      { status: 409 },
    );
  }

  const fd = await req.formData();
  const file = fd.get("file");
  const mode = String(fd.get("mode") ?? "preview");
  const deleteMissing = String(fd.get("deleteMissing") ?? "false") === "true";
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let parsed: { rows: ImportRow[]; sheetsFound: string[] };
  try {
    parsed = parseEarWorkbookForImport(buf);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Datei konnte nicht gelesen werden." },
      { status: 400 },
    );
  }

  const accounts = await prisma.account.findMany();
  const accByType: Record<string, string | undefined> = {};
  for (const a of accounts) accByType[a.type] = a.id;
  const cats = await prisma.category.findMany({ where: { OR: [{ clubYearId: null }, { clubYearId: id }] } });
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const dbTxs = await prisma.transaction.findMany({
    where: { clubYearId: id, deletedAt: null },
    select: { id: true, accountId: true, date: true, amount: true, counterparty: true, purpose: true, code: true, categoryId: true },
  });
  const dbById = new Map(dbTxs.map((t) => [t.id, t]));

  type Action =
    | { kind: "update"; txId: string; before: typeof dbTxs[number]; after: ImportRow & { categoryId: string | null; accountId: string }; changed: string[] }
    | { kind: "create"; row: ImportRow & { categoryId: string | null; accountId: string } }
    | { kind: "softDelete"; txId: string; counterparty: string | null; date: Date; amount: number };

  const actions: Action[] = [];

  function approxKey(date: Date, amount: number, accountId: string, counterparty: string | null) {
    return `${accountId}|${date.toISOString().slice(0, 10)}|${Math.round(amount * 100)}|${(counterparty ?? "").trim().toLowerCase()}`;
  }
  const dbKeyMap = new Map<string, string>();
  for (const t of dbTxs) dbKeyMap.set(approxKey(t.date, t.amount, t.accountId, t.counterparty), t.id);
  const matchedDbIds = new Set<string>();

  for (const row of parsed.rows) {
    const accountId = accByType[row.accountType];
    if (!accountId) continue;
    let categoryId: string | null = null;
    if (row.bucketHeader) {
      const headerLc = row.bucketHeader.toLowerCase();
      // Sign-abhängiges Mapping (RYLA/Spenden/Sonstiges können in beiden Sektionen vorkommen).
      const headerToCategory: Record<string, string> = {
        "mit´beitrag": "Mitgliedsbeitrag",
        "mitgliedsbeitrag": "Mitgliedsbeitrag",
        "a.gebühr": "Aufnahmegebühr",
        "ryla": row.amount > 0 ? "RYLA Einnahmen" : "RYLA Ausgaben",
        "spenden": row.amount > 0 ? "Spenden Einnahmen" : "Clubprojekte / Spenden",
        "zinsen": "Zinsen",
        "distrikt": "Distriktsbeitrag",
        "rotary intl.": "Rotary Intl. & Foundation",
        "rotary int.": "Rotary Intl. & Foundation",
        "rotary sonst.": "Sonstige Ausgaben",
        "spesen": "Spesen",
        "saalmiete": "Saalmiete",
      };
      const mapped = headerToCategory[headerLc];
      if (mapped) categoryId = catByName.get(mapped.toLowerCase()) ?? null;
    }
    if (!categoryId) {
      const guess = autoCategoryName({ purpose: `${row.counterparty} ${row.purpose ?? ""}`, counterparty: row.counterparty, code: row.code, amount: row.amount });
      if (guess) categoryId = catByName.get(guess.name.toLowerCase()) ?? null;
    }

    const after = { ...row, categoryId, accountId };

    let dbId: string | null = null;
    if (row.txId && dbById.has(row.txId)) dbId = row.txId;
    if (!dbId) {
      const k = approxKey(row.date, row.amount, accountId, row.counterparty);
      const m = dbKeyMap.get(k);
      if (m && !matchedDbIds.has(m)) dbId = m;
    }

    if (dbId) {
      matchedDbIds.add(dbId);
      const before = dbById.get(dbId);
      if (!before) continue;
      // Wenn die Excel-Spalte ein Sammel-Bucket („Sonstiges") ist und die Buchung
      // bereits eine Kategorie hat, behalten wir die bisherige Zuordnung. Damit
      // ist der Roundtrip Export → Re-Import stabil. Für gezielte Umbuchung
      // verschiebt der User den Betrag in eine spezifischere Spalte.
      const isCatchAll = row.bucketHeader && /^sonst/i.test(row.bucketHeader.trim());
      if (isCatchAll && before.categoryId) {
        categoryId = before.categoryId;
        after.categoryId = before.categoryId;
      }
      // Normalize "" ↔ null und Whitespace für Vergleich
      const norm = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
      const cpRow = norm(row.counterparty);
      const purRow = norm(row.purpose);
      const codeRow = norm(row.code);
      const changed: string[] = [];
      if (norm(before.counterparty) !== cpRow) changed.push("counterparty");
      if (norm(before.purpose) !== purRow) changed.push("purpose");
      if (norm(before.code) !== codeRow) changed.push("code");
      if (Math.round(before.amount * 100) !== Math.round(row.amount * 100)) changed.push("amount");
      if (before.date.toISOString().slice(0, 10) !== row.date.toISOString().slice(0, 10)) changed.push("date");
      if ((before.categoryId ?? null) !== (categoryId ?? null)) changed.push("category");
      if (changed.length) actions.push({ kind: "update", txId: dbId, before, after, changed });
    } else {
      actions.push({ kind: "create", row: after });
    }
  }

  if (deleteMissing) {
    for (const t of dbTxs) {
      if (!matchedDbIds.has(t.id)) {
        actions.push({ kind: "softDelete", txId: t.id, counterparty: t.counterparty, date: t.date, amount: t.amount });
      }
    }
  }

  const summary = {
    sheetsFound: parsed.sheetsFound,
    parsed: parsed.rows.length,
    updates: actions.filter((a) => a.kind === "update").length,
    creates: actions.filter((a) => a.kind === "create").length,
    softDeletes: actions.filter((a) => a.kind === "softDelete").length,
    matchedDbIds: matchedDbIds.size,
    dbTotal: dbTxs.length,
  };

  if (mode !== "commit") {
    return NextResponse.json({
      mode: "preview",
      summary,
      actions: actions.slice(0, 200).map((a) => {
        if (a.kind === "update")
          return {
            kind: "update",
            txId: a.txId,
            changed: a.changed,
            before: { date: a.before.date, amount: a.before.amount, counterparty: a.before.counterparty, purpose: a.before.purpose, categoryId: a.before.categoryId },
            after: { date: a.after.date, amount: a.after.amount, counterparty: a.after.counterparty, purpose: a.after.purpose, categoryId: a.after.categoryId },
          };
        if (a.kind === "create")
          return {
            kind: "create",
            row: { date: a.row.date, amount: a.row.amount, counterparty: a.row.counterparty, purpose: a.row.purpose, categoryId: a.row.categoryId, accountType: a.row.accountType },
          };
        return { kind: "softDelete", txId: a.txId, date: a.date, amount: a.amount, counterparty: a.counterparty };
      }),
    });
  }

  // commit
  const tx = await prisma.$transaction(async (txdb) => {
    for (const a of actions) {
      if (a.kind === "update") {
        await txdb.transaction.update({
          where: { id: a.txId },
          data: {
            date: a.after.date,
            counterparty: a.after.counterparty || null,
            purpose: a.after.purpose ?? null,
            code: a.after.code ?? null,
            amount: a.after.amount,
            categoryId: a.after.categoryId,
          },
        });
      } else if (a.kind === "create") {
        await txdb.transaction.create({
          data: {
            accountId: a.row.accountId,
            clubYearId: id,
            date: a.row.date,
            counterparty: a.row.counterparty || null,
            purpose: a.row.purpose ?? null,
            code: a.row.code ?? null,
            amount: a.row.amount,
            categoryId: a.row.categoryId,
            source: "MANUAL",
            createdById: session?.user?.id,
            note: "Korrektur via Excel-Import",
          },
        });
      } else if (a.kind === "softDelete") {
        await txdb.transaction.update({ where: { id: a.txId }, data: { deletedAt: new Date() } });
      }
    }
    return true;
  });

  return NextResponse.json({ mode: "commit", ok: tx, summary });
}