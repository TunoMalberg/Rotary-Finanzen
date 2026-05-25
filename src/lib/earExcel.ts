/**
 * Excel-Export & Re-Import im EAR-Format des RC Wien-Donau.
 *
 * Sheets, kompatibel zu den historischen Dateien
 *  ("EAR Rotary Wien Donau 2024-25.xlsx" etc.):
 *
 *    Deckblatt              Titel + Clubjahr
 *    ERSTE Konto            Buchungen Hauptkonto
 *    ERSTE Global Grant     Buchungen Global-Grant-Treuhand
 *    Abschluß               Soll/Ist-Tabelle Einnahmen/Ausgaben
 *    Budget Neu             Budgetvoranschlag
 *
 * Das Hauptkonto-Sheet enthält pro Buchung sowohl die Spaltenform der
 * Excel-Vorlage (Mit´beitrag, A.gebühr, RYLA, …) als auch eine
 * laufenden KONTO-Spalte. Damit kann der Schatzmeister im Excel direkt
 * Korrekturen vornehmen und die Datei im selben Format wieder hochladen.
 */
import * as XLSX from "xlsx";
import type { Account, BudgetLine, Category, ClubYear, Transaction } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────
// Spaltendefinitionen pro Konto (Reihenfolge wie Original-Excel)
// ──────────────────────────────────────────────────────────────────────

type ColumnSpec = {
  header: string;
  /** Kategorie-Name-Match (case-insensitive); leer = "Sonstiges"-Sammelspalte */
  categoryMatch?: string[];
  /** Wenn true: nur positive Werte (Einnahmen) / sonst Ausgaben (negativ/abs) */
  income: boolean;
};

const MAIN_INCOME_COLS: ColumnSpec[] = [
  { header: "Mit´beitrag", income: true, categoryMatch: ["Mitgliedsbeitrag"] },
  { header: "A.gebühr", income: true, categoryMatch: ["Aufnahmegebühr"] },
  { header: "RYLA", income: true, categoryMatch: ["RYLA Einnahmen"] },
  { header: "Spenden", income: true, categoryMatch: ["Spenden Einnahmen", "Fundraising"] },
  { header: "Zinsen", income: true, categoryMatch: ["Zinsen"] },
  { header: "Sonstiges", income: true, categoryMatch: ["Sonstige Einnahmen", "District Grant", "Präsenzaufwand Einnahmen"] },
];

const MAIN_EXPENSE_COLS: ColumnSpec[] = [
  { header: "Distrikt", income: false, categoryMatch: ["Distriktsbeitrag"] },
  { header: "Rotary Intl. ", income: false, categoryMatch: ["Rotary Intl. & Foundation"] },
  { header: "Spesen", income: false, categoryMatch: ["Spesen"] },
  { header: "RYLA", income: false, categoryMatch: ["RYLA Ausgaben"] },
  { header: "Spenden", income: false, categoryMatch: ["Clubprojekte / Spenden"] },
  { header: "Saalmiete", income: false, categoryMatch: ["Saalmiete"] },
  { header: "Sonstiges", income: false, categoryMatch: ["Sonstige Ausgaben", "Präsenzaufwand"] },
];

const GG_INCOME_COLS: ColumnSpec[] = [
  { header: "Mit´beitrag", income: true, categoryMatch: ["Mitgliedsbeitrag"] },
  { header: "A.gebühr", income: true, categoryMatch: ["Aufnahmegebühr"] },
  { header: "Spenden", income: true, categoryMatch: ["Spenden Einnahmen", "Fundraising", "Clubprojekte / Spenden"] },
  { header: "Zinsen", income: true, categoryMatch: ["Zinsen"] },
  { header: "Sonstiges", income: true, categoryMatch: ["Sonstige Einnahmen"] },
];

const GG_EXPENSE_COLS: ColumnSpec[] = [
  { header: " Rotary Int.", income: false, categoryMatch: ["Rotary Intl. & Foundation", "Distriktsbeitrag"] },
  { header: "Rotary sonst.", income: false, categoryMatch: ["Sonstige Ausgaben"] },
  { header: "Spesen", income: false, categoryMatch: ["Spesen"] },
  { header: "Spenden", income: false, categoryMatch: ["Global Grant", "Clubprojekte / Spenden"] },
  { header: "Saalmiete", income: false, categoryMatch: ["Saalmiete"] },
  { header: "Sonstiges", income: false, categoryMatch: ["Präsenzaufwand"] },
];

// ──────────────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────────────

export type AccountTxRow = Transaction & {
  category: Pick<Category, "id" | "name" | "kind"> | null;
};

export type ExportInput = {
  clubYear: ClubYear;
  treasurerName?: string | null;
  mainAccount?: Account | null;
  ggAccount?: Account | null;
  mainTxs: AccountTxRow[];
  ggTxs: AccountTxRow[];
  budgetLines: (BudgetLine & { category: Category })[];
  /** Alle Kategorien (für Fallback-Mapping) */
  categories: Category[];
};

function pickColumn(cols: ColumnSpec[], categoryName: string | null | undefined): number {
  if (!categoryName) return cols.length - 1; // Sonstiges
  const lc = categoryName.toLowerCase();
  let firstSonstigesIdx = -1;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.categoryMatch || c.categoryMatch.length === 0) continue;
    if (c.categoryMatch.some((m) => m.toLowerCase() === lc)) return i;
  }
  // Sonstiges-Header (header === "Sonstiges")
  for (let i = 0; i < cols.length; i++) {
    if (/sonst/i.test(cols[i].header)) {
      firstSonstigesIdx = i;
      break;
    }
  }
  return firstSonstigesIdx >= 0 ? firstSonstigesIdx : cols.length - 1;
}

function buildAccountSheet(
  title: string,
  iban: string | null | undefined,
  yearLabel: string,
  opening: number,
  txs: AccountTxRow[],
  incomeCols: ColumnSpec[],
  expenseCols: ColumnSpec[],
): XLSX.WorkSheet {
  const incomeWidth = incomeCols.length;
  const expenseWidth = expenseCols.length;
  const headers = [
    "Datum",
    "TEXT",
    "CODE",
    "Anmerkung",
    ...incomeCols.map((c) => c.header),
    ...expenseCols.map((c) => c.header),
    "KONTO",
    "Anmerkung",
  ];
  const banner = new Array(headers.length).fill(null) as (string | null)[];
  banner[1] = `EINNAHMEN - AUSGABENBUCH DES ROTARY CLUB WIEN DONAU FÜR DAS ROTARISCHE JAHR ${yearLabel}`;

  const sectionRow = new Array(headers.length).fill(null) as (string | null)[];
  sectionRow[4] = "Einnahmen";
  sectionRow[7] = "EINNAHMEN";
  sectionRow[4 + incomeWidth] = "Ausgaben";
  sectionRow[4 + incomeWidth + expenseWidth] = "KONTO";

  const rows: (string | number | Date | null)[][] = [];
  rows.push(banner);
  rows.push(sectionRow);
  rows.push(headers);
  // IBAN line + opening balance in KONTO column
  const ibanRow: (string | number | Date | null)[] = new Array(headers.length).fill(null);
  ibanRow[1] = iban ? `IBAN ${iban}` : null;
  ibanRow[4 + incomeWidth + expenseWidth] = opening;
  rows.push(ibanRow);

  let running = opening;
  // Sort by date ascending
  const sorted = [...txs].sort((a, b) => +a.date - +b.date);
  for (const tx of sorted) {
    running += tx.amount;
    const row: (string | number | Date | null)[] = new Array(headers.length).fill(null);
    row[0] = tx.date;
    row[1] = tx.counterparty ?? "";
    row[2] = tx.code ?? "";
    row[3] = tx.purpose ?? tx.note ?? "";
    if (tx.amount > 0) {
      const idx = pickColumn(incomeCols, tx.category?.name);
      row[4 + idx] = round2(tx.amount);
    } else if (tx.amount < 0) {
      const idx = pickColumn(expenseCols, tx.category?.name);
      row[4 + incomeWidth + idx] = round2(tx.amount);
    }
    row[4 + incomeWidth + expenseWidth] = round2(running);
    // Anmerkung extra column → externalRef (für Re-Import)
    row[headers.length - 1] = tx.id;
    rows.push(row);
  }

  // Closing row
  const closing: (string | number | Date | null)[] = new Array(headers.length).fill(null);
  closing[1] = `Endsaldo per ${yearLabel.split("/")[1]}-06-30`;
  closing[4 + incomeWidth + expenseWidth] = round2(running);
  rows.push(closing);

  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  // Column widths for readability
  ws["!cols"] = [
    { wch: 12 }, // Datum
    { wch: 36 }, // TEXT
    { wch: 28 }, // CODE
    { wch: 24 }, // Anmerkung
    ...incomeCols.map(() => ({ wch: 12 })),
    ...expenseCols.map(() => ({ wch: 12 })),
    { wch: 14 }, // KONTO
    { wch: 28 }, // Anmerkung Tom (txId)
  ];
  // Format date column as dd.mm.yyyy
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = 4; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 0 });
    const cell = ws[addr];
    if (cell && cell.t === "d") cell.z = "dd.mm.yyyy";
  }
  return ws;
}

function buildDeckblatt(yearLabel: string, treasurerName?: string | null): XLSX.WorkSheet {
  const rows: (string | null)[][] = [];
  rows.push([null]);
  rows.push([null]);
  rows.push(["ROTARY CLUB WIEN - DONAU"]);
  rows.push([null]);
  rows.push([null]);
  rows.push(["EINNAHMEN-AUSGABEN-RECHNUNG"]);
  rows.push([null]);
  rows.push(["FÜR DAS CLUBJAHR"]);
  rows.push([null]);
  rows.push([yearLabel]);
  rows.push([null]);
  rows.push(["PER"]);
  rows.push([null]);
  const [a, b] = yearLabel.split("/");
  rows.push([`(1.7.${a}-30.6.${b} )`]);
  if (treasurerName) rows.push([`Schatzmeister: ${treasurerName}`]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 60 }];
  return ws;
}

function buildAbschluss(
  yearLabel: string,
  txs: AccountTxRow[],
  budgetLines: (BudgetLine & { category: Category })[],
): XLSX.WorkSheet {
  // Aggregate per category
  const totals = new Map<string, { name: string; kind: string; amount: number }>();
  for (const t of txs) {
    if (!t.category) continue;
    const cur = totals.get(t.category.id) ?? { name: t.category.name, kind: t.category.kind, amount: 0 };
    cur.amount += t.amount;
    totals.set(t.category.id, cur);
  }
  const budgetByCat = new Map(budgetLines.map((b) => [b.categoryId, b.amount]));
  const incomeRows: { name: string; ist: number; soll: number }[] = [];
  const expenseRows: { name: string; ist: number; soll: number }[] = [];
  // Sort by sortOrder via budgetLines / fallback
  const seen = new Set<string>();
  for (const bl of budgetLines.sort((a, b) => a.category.sortOrder - b.category.sortOrder)) {
    seen.add(bl.categoryId);
    const t = totals.get(bl.categoryId);
    const ist = bl.category.kind === "INCOME" ? Math.max(0, t?.amount ?? 0) : Math.abs(Math.min(0, t?.amount ?? 0));
    const row = { name: bl.category.name, ist: round2(ist), soll: round2(bl.amount) };
    if (bl.category.kind === "INCOME") incomeRows.push(row);
    else if (bl.category.kind === "EXPENSE") expenseRows.push(row);
  }
  for (const [catId, t] of totals) {
    if (seen.has(catId)) continue;
    const ist = t.kind === "INCOME" ? Math.max(0, t.amount) : Math.abs(Math.min(0, t.amount));
    const row = { name: t.name, ist: round2(ist), soll: 0 };
    if (t.kind === "INCOME") incomeRows.push(row);
    else if (t.kind === "EXPENSE") expenseRows.push(row);
  }

  const rows: (string | number | null)[][] = [];
  rows.push(["ROTARY CLUB WIEN-DONAU"]);
  rows.push([`Rechnungsabschluss Clubjahr ${yearLabel}`]);
  rows.push([null]);
  rows.push(["per", null, null, null]);
  rows.push([`30.6.${yearLabel.split("/")[1]}`]);
  rows.push(["EINNAHMEN", null, null, "in €", "(Budget)", "Abw. in %"]);
  rows.push([null]);
  let sumIstIn = 0;
  let sumSollIn = 0;
  for (const r of incomeRows) {
    sumIstIn += r.ist;
    sumSollIn += r.soll;
    const abw = r.soll > 0 ? (r.ist - r.soll) / r.soll : 0;
    rows.push([r.name, null, null, r.ist, r.soll, abw]);
    rows.push([null]);
  }
  rows.push([null, null, null, round2(sumIstIn), round2(sumSollIn), sumSollIn > 0 ? (sumIstIn - sumSollIn) / sumSollIn : 0]);
  rows.push([null]);
  rows.push([null]);
  rows.push(["AUSGABEN", null, null, "in €", "(Budget)", "Abw. in %"]);
  rows.push([null]);
  let sumIstOut = 0;
  let sumSollOut = 0;
  for (const r of expenseRows) {
    sumIstOut += r.ist;
    sumSollOut += r.soll;
    const abw = r.soll > 0 ? (r.ist - r.soll) / r.soll : 0;
    rows.push([r.name, null, null, r.ist, r.soll, abw]);
    rows.push([null]);
  }
  rows.push([null, null, null, round2(sumIstOut), round2(sumSollOut), sumSollOut > 0 ? (sumIstOut - sumSollOut) / sumSollOut : 0]);
  rows.push([null]);
  rows.push(["Saldo", null, null, round2(sumIstIn - sumIstOut), round2(sumSollIn - sumSollOut), null]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 42 }, { wch: 4 }, { wch: 4 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  return ws;
}

function buildBudgetSheet(
  yearLabel: string,
  budgetLines: (BudgetLine & { category: Category })[],
): XLSX.WorkSheet {
  const rows: (string | number | null)[][] = [];
  rows.push(["ROTARY CLUB WIEN-DONAU"]);
  rows.push([`Budgetvoranschlag für das Clubjahr ${yearLabel}`]);
  rows.push([null]);
  rows.push([null]);
  rows.push(["EINNAHMEN", null, null, "in €"]);
  rows.push([null]);
  let sumIn = 0;
  for (const bl of budgetLines.filter((b) => b.category.kind === "INCOME").sort((a, b) => a.category.sortOrder - b.category.sortOrder)) {
    sumIn += bl.amount;
    rows.push([bl.category.name, null, null, round2(bl.amount)]);
  }
  rows.push([null]);
  rows.push([null, null, null, round2(sumIn)]);
  rows.push([null]);
  rows.push(["AUSGABEN", null, null, "in €"]);
  rows.push([null]);
  let sumOut = 0;
  for (const bl of budgetLines.filter((b) => b.category.kind === "EXPENSE").sort((a, b) => a.category.sortOrder - b.category.sortOrder)) {
    sumOut += bl.amount;
    rows.push([bl.category.name, null, null, round2(bl.amount)]);
  }
  rows.push([null]);
  rows.push([null, null, null, round2(sumOut)]);
  rows.push([null]);
  rows.push(["Saldo (Einnahmen − Ausgaben)", null, null, round2(sumIn - sumOut)]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 42 }, { wch: 4 }, { wch: 4 }, { wch: 14 }];
  return ws;
}

export function buildEarWorkbook(input: ExportInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const yearLabel = input.clubYear.label;

  XLSX.utils.book_append_sheet(wb, buildDeckblatt(yearLabel, input.treasurerName ?? undefined), "Deckblatt");
  XLSX.utils.book_append_sheet(
    wb,
    buildAccountSheet(
      "ERSTE Konto",
      input.mainAccount?.iban ?? null,
      yearLabel,
      input.clubYear.openingBalanceMain,
      input.mainTxs,
      MAIN_INCOME_COLS,
      MAIN_EXPENSE_COLS,
    ),
    "ERSTE Konto",
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildAccountSheet(
      "ERSTE Global Grant",
      input.ggAccount?.iban ?? null,
      yearLabel,
      input.clubYear.openingBalanceGG,
      input.ggTxs,
      GG_INCOME_COLS,
      GG_EXPENSE_COLS,
    ),
    "ERSTE Global Grant",
  );
  XLSX.utils.book_append_sheet(wb, buildAbschluss(yearLabel, [...input.mainTxs, ...input.ggTxs], input.budgetLines), "Abschluß");
  XLSX.utils.book_append_sheet(wb, buildBudgetSheet(yearLabel, input.budgetLines), "Budget Neu");

  return wb;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ──────────────────────────────────────────────────────────────────────
// Re-Import (Korrektur-Workflow)
// ──────────────────────────────────────────────────────────────────────

export type ImportRow = {
  /** Spalte "Anmerkung" am rechten Rand – enthält bei Export die Transaction.id. Bei manueller Erfassung im Excel optional leer. */
  txId: string | null;
  date: Date;
  counterparty: string;
  code: string | null;
  purpose: string | null;
  amount: number;
  /** Erkannte Spalten-Header → Beträge; nur für Diagnose/Debug. */
  bucketHeader: string | null;
  /** Account-Type, abgeleitet aus dem Sheet-Namen */
  accountType: "MAIN" | "GLOBAL_GRANT_TRUST";
};

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] as unknown[])?.[0] === "Datum") return i;
  }
  return -1;
}

export function parseEarWorkbookForImport(buf: Buffer): { rows: ImportRow[]; sheetsFound: string[] } {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const out: ImportRow[] = [];
  const sheetsFound: string[] = [];
  for (const sheetEntry of [
    { type: "MAIN" as const, names: ["ERSTE Konto"] },
    { type: "GLOBAL_GRANT_TRUST" as const, names: ["ERSTE Global Grant", "ERSTE Global Grant "] },
  ]) {
    let ws: XLSX.WorkSheet | undefined;
    let used: string | null = null;
    for (const n of sheetEntry.names) {
      if (wb.Sheets[n]) {
        ws = wb.Sheets[n];
        used = n;
        break;
      }
    }
    if (!ws) continue;
    sheetsFound.push(used as string);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true }) as unknown[][];
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) continue;
    const header = rows[headerIdx] as (string | null)[];
    // Detect KONTO column (used as upper bound for amount columns)
    let kontoCol = header.findIndex((h, i) => i > 4 && typeof h === "string" && /^konto$/i.test((h as string).trim()));
    if (kontoCol < 0) {
      const above = rows[headerIdx - 1];
      if (Array.isArray(above)) {
        for (let i = 0; i < above.length; i++) {
          if (typeof above[i] === "string" && /KONTO/.test(above[i] as string)) {
            kontoCol = i;
            break;
          }
        }
      }
    }
    if (kontoCol < 0) kontoCol = sheetEntry.type === "MAIN" ? 17 : 15;
    // txId is in column AFTER KONTO ("Anmerkung" right-most). We'll search for any non-empty trailing UUID-like value.
    const txIdCol = header.findIndex((h, i) => i > kontoCol && typeof h === "string" && /anmerkung/i.test(h as string));

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] as (string | number | Date | null)[];
      const date = r[0];
      if (!(date instanceof Date)) continue;
      const counterparty = (typeof r[1] === "string" ? (r[1] as string) : "") ?? "";
      const code = typeof r[2] === "string" ? (r[2] as string) : null;
      const purposeRaw = r[3];
      const purpose = typeof purposeRaw === "string" ? purposeRaw : null;
      let amount = 0;
      let bucketHeader: string | null = null;
      for (let c = 4; c < kontoCol; c++) {
        const v = r[c];
        if (typeof v === "number" && v !== 0) {
          amount += v;
          if (!bucketHeader && typeof header[c] === "string") bucketHeader = (header[c] as string).trim();
        }
      }
      if (amount === 0) continue;
      const txId = txIdCol >= 0 && typeof r[txIdCol] === "string" ? (r[txIdCol] as string) : null;
      out.push({
        txId: txId && /^c[a-z0-9]{20,}$/i.test(txId) ? txId : null,
        date,
        counterparty,
        code,
        purpose,
        amount: Math.round(amount * 100) / 100,
        bucketHeader,
        accountType: sheetEntry.type,
      });
    }
  }
  return { rows: out, sheetsFound };
}