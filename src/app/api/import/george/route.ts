import { authOptions, isTreasurer } from "@/lib/auth";
import { parseBankFile } from "@/lib/bankImport";
import { autoCategoryName, rankCategories } from "@/lib/categorize";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

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
  try {
    return await handle(req);
  } catch (e) {
    // Wir wollen, dass der Schatzmeister im UI den echten Grund sieht
    // (statt eines generischen „Import fehlgeschlagen"). Daher Fehler hier
    // einfangen, ins Vercel-Log schreiben und als JSON zurückliefern.
    console.error("[/api/import/george] failed:", e);
    const msg =
      e instanceof Error
        ? `${e.name}: ${e.message}`
        : "Unbekannter Fehler beim Import.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: Request) {
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
  /**
   * Optionale User-Zuordnungen aus dem Zuordnungs-Dialog.
   * { rowKey: { categoryId?: string|null, projectId?: string|null } }
   * rowKey = `${date.toISOString()}|${amount}|${externalRef ?? ""}|${purposeHash}`.
   */
  let userAssignments: Record<
    string,
    { categoryId?: string | null; projectId?: string | null }
  > = {};
  const assignmentsRaw = fd.get("assignments");
  if (typeof assignmentsRaw === "string" && assignmentsRaw.trim()) {
    try {
      userAssignments = JSON.parse(assignmentsRaw);
    } catch {
      // ignore
    }
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!accountId || !clubYearId) {
    return NextResponse.json(
      { error: "accountId/clubYearId fehlen" },
      { status: 400 },
    );
  }
  // Lifecycle-Schutz: in fixierte Jahre niemals importieren.
  const targetYear = await prisma.clubYear.findUnique({ where: { id: clubYearId } });
  if (!targetYear) return NextResponse.json({ error: "Clubjahr nicht gefunden" }, { status: 400 });
  if (targetYear.lockedAt) {
    return NextResponse.json(
      { error: `Clubjahr ${targetYear.label} ist fixiert – Bank-Import nicht möglich.` },
      { status: 409 },
    );
  }

  let parseResult;
  try {
    parseResult = await parseBankFile(file);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Datei konnte nicht gelesen werden.",
      },
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
  // Kategorien: globale (clubYearId=NULL) UND year-spezifische des aktuellen Clubjahrs
  const [cats, members, projectIds] = await Promise.all([
    prisma.category.findMany({
      where: { OR: [{ clubYearId: null }, { clubYearId }] },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.member.findMany({ select: { id: true, lastName: true } }),
    prisma.project.findMany({ select: { id: true } }),
  ]);
  const catByName = new Map(cats.map((c) => [c.name, c.id]));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const validProjectIds = new Set(projectIds.map((p) => p.id));

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

  type Suggestion = {
    id: string;
    name: string;
    kind: string;
    color: string;
    score: number;
  };
  type PreviewRow = {
    rowKey: string;
    date: string;
    counterparty: string | null;
    purpose: string | null;
    amount: number;
    category: string | null;
    /** ID der initial vorgeschlagenen Kategorie (auto). */
    suggestedCategoryId: string | null;
    /** Top-N alternative Vorschläge mit Score (sortiert absteigend). */
    suggestions: Suggestion[];
    isDuplicate: boolean;
    isSkippedOlder: boolean;
    matchedMember: string | null;
    externalRef: string | null;
  };

  function makeRowKey(
    date: Date,
    amount: number,
    externalRef: string | null,
    purpose: string | null,
  ): string {
    // simple hash of purpose to keep length bounded
    let h = 0;
    const s = purpose ?? "";
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return `${date.toISOString()}|${amount}|${externalRef ?? ""}|${h}`;
  }

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
    const rowKey = makeRowKey(r.date, r.amount, externalRef, purpose);

    // Älter als letzte Buchung → skippen, außer importAll=true
    if (isOlder && !importAll) {
      skippedOlder++;
      preview.push({
        rowKey,
        date: r.date.toISOString(),
        counterparty,
        purpose,
        amount: r.amount,
        category: null,
        suggestedCategoryId: null,
        suggestions: [],
        isDuplicate: false,
        isSkippedOlder: true,
        matchedMember: null,
        externalRef,
      });
      continue;
    }

    // Duplikat-Erkennung
    //   1. exakter externalRef-Treffer (Bank-Buchungsreferenz)
    //   2. Fallback A: Date + Amount + Purpose (alte Logik, exakter Match)
    //   3. Fallback B: Date + Amount – wenn die vorhandene Buchung KEINE
    //      externalRef hat (z. B. manuell oder per Seed angelegt) und der
    //      neue Datensatz eine externalRef bringt → fast sicher dieselbe
    //      Buchung. In diesem Fall *upgraden* wir die vorhandene Buchung
    //      (externalRef + counterparty + ggf. fehlende Infos nachpflegen)
    //      statt ein Duplikat zu erzeugen.
    let dup = null as { id: string } | null;
    let upgradeTarget: {
      id: string;
      counterparty: string | null;
      purpose: string | null;
      externalRef: string | null;
    } | null = null;
    if (externalRef) {
      // Wichtig: nur als Duplikat werten, wenn auch Betrag + Zweck identisch sind.
      // George/Erste vergibt mehreren Quartals-Spesen am 31.3./30.6./30.9./31.12.
      // dieselbe Bank-Buchungsreferenz – das sind aber VERSCHIEDENE Buchungen.
      dup = await prisma.transaction.findFirst({
        where: {
          accountId,
          externalRef,
          amount: r.amount,
          purpose,
          deletedAt: null,
        },
        select: { id: true },
      });
    }
    if (!dup) {
      // Fallback A: date + amount + purpose
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
    if (!dup && externalRef) {
      // Fallback B: gleicher Tag + gleicher Betrag, vorhandene Zeile ohne externalRef
      const candidate = await prisma.transaction.findFirst({
        where: {
          accountId,
          date: r.date,
          amount: r.amount,
          externalRef: null,
          deletedAt: null,
        },
        select: {
          id: true,
          counterparty: true,
          purpose: true,
          externalRef: true,
        },
      });
      if (candidate) {
        dup = { id: candidate.id };
        upgradeTarget = candidate;
      }
    }
    if (dup) {
      // Upgrade-Fall: existierende Buchung um Bank-Metadaten ergänzen
      if (!dryRun && upgradeTarget && externalRef) {
        await prisma.transaction.update({
          where: { id: upgradeTarget.id },
          data: {
            externalRef,
            counterparty: upgradeTarget.counterparty || counterparty,
            purpose: upgradeTarget.purpose || purpose,
            valueDate: r.valueDate ?? undefined,
          },
        });
      }
      duplicates++;
      preview.push({
        rowKey,
        date: r.date.toISOString(),
        counterparty,
        purpose,
        amount: r.amount,
        category: null,
        suggestedCategoryId: null,
        suggestions: [],
        isDuplicate: true,
        isSkippedOlder: false,
        matchedMember: null,
        externalRef,
      });
      continue;
    }

    // Auto-Kategorisierung + Top-Vorschläge
    const cat = autoCategoryName({
      purpose,
      counterparty,
      code: r.partnerIban,
      amount: r.amount,
    });
    const autoCategoryId = cat ? (catByName.get(cat.name) ?? null) : null;
    const ranked = rankCategories(
      cats.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        color: c.color,
      })),
      { purpose, counterparty, code: r.partnerIban, amount: r.amount },
      4,
    );
    // User override has priority over auto, falls back to auto.
    // Wichtig: leere Strings ("") aus dem Frontend zu null normalisieren —
    // sonst FK-Violation in Postgres (SQLite war hier still nachsichtig).
    const userOverride = userAssignments[rowKey];
    const normalize = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    let finalCategoryId: string | null;
    if (userOverride && "categoryId" in userOverride) {
      finalCategoryId = normalize(userOverride.categoryId);
    } else {
      finalCategoryId = autoCategoryId;
    }
    // Falls die zugewiesene Kategorie nicht (mehr) existiert → ignorieren.
    if (finalCategoryId && !catById.has(finalCategoryId)) finalCategoryId = null;
    let finalProjectId = normalize(userOverride?.projectId);
    if (finalProjectId && !validProjectIds.has(finalProjectId))
      finalProjectId = null;
    const finalCategoryName = finalCategoryId
      ? (catById.get(finalCategoryId)?.name ?? null)
      : null;

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
          categoryId: finalCategoryId,
          projectId: finalProjectId,
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
            data: {
              status: "PAID",
              paidAt: new Date(),
              paidTransactionId: txn.id,
            },
          });
          autoMatched++;
        }
      }
    }

    created++;
    preview.push({
      rowKey,
      date: r.date.toISOString(),
      counterparty,
      purpose,
      amount: r.amount,
      category: finalCategoryName,
      suggestedCategoryId: autoCategoryId,
      suggestions: ranked,
      isDuplicate: false,
      isSkippedOlder: false,
      matchedMember: memberName,
      externalRef,
    });
  }

  // Aktive Projekte des Clubs (project select happens client-side)
  const projects = await prisma.project.findMany({
    where: { isClosed: false },
    select: { id: true, code: true, name: true, color: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

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
    preview: preview.slice(0, 1000),
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      clubYearId: c.clubYearId,
    })),
    projects,
  });
}
