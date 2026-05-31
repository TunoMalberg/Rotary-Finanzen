/**
 * Excel-Export des Schatzmeister-Berichts.
 *
 * Mehrere Sheets:
 *  1. Deckblatt (Executive Summary)
 *  2. Soll-Ist-Vergleich
 *  3. Buchungen (alle)
 *  4. Clubprojekte
 *  5. Offene Mitgliedsbeiträge
 *  6. Sonstige offene Forderungen
 *  7. Auslagenbericht
 */
import ExcelJS from "exceljs";
import type { TreasurerReport } from "../treasurerReport";

const ROTARY_BLUE = "FF17458F";
const ROTARY_GOLD = "FFF7A81B";
const LIGHT_BG = "FFF1F5F9";

export async function buildTreasurerExcel(report: TreasurerReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = report.generatedBy ?? "Rotary Finance";
  wb.lastModifiedBy = report.generatedBy ?? "Rotary Finance";
  wb.created = report.generatedAt;
  wb.modified = report.generatedAt;
  wb.title = `Schatzmeister-${report.isInterim ? "Zwischenabschluss" : "Abschluss"} ${report.clubYear.label}`;
  wb.subject = report.club.name;
  wb.company = report.club.name;

  const eur = '#,##0.00 "€";[Red]-#,##0.00 "€"';
  const dateFmt = "DD.MM.YYYY";

  /* ================================ 1. Deckblatt ================================ */
  const cover = wb.addWorksheet("Deckblatt", {
    properties: { tabColor: { argb: ROTARY_BLUE } },
    views: [{ showGridLines: false }],
  });
  cover.columns = [{ width: 35 }, { width: 28 }];

  cover.mergeCells("A1:B1");
  cover.getCell("A1").value = report.club.name;
  cover.getCell("A1").font = { bold: true, size: 22, color: { argb: ROTARY_BLUE } };
  cover.getRow(1).height = 36;

  cover.mergeCells("A2:B2");
  cover.getCell("A2").value = `${report.isInterim ? "Zwischenabschluss" : "Jahresabschluss"} – Schatzmeister-Bericht`;
  cover.getCell("A2").font = { bold: true, size: 14, color: { argb: "FF334155" } };

  cover.mergeCells("A3:B3");
  cover.getCell("A3").value = `Clubjahr ${report.clubYear.label}`;
  cover.getCell("A3").font = { size: 12, color: { argb: "FF64748B" } };

  cover.addRow([]);
  // KPI table
  type KpiLine =
    | { spacer: true }
    | { label: string; value: string | number; money?: boolean };
  const kpis: KpiLine[] = [
    {
      label: "Berichtszeitraum",
      value: `${fmtDate(report.clubYear.startsAt)} – ${fmtDate(report.isInterim ? report.asOf : report.clubYear.endsAt)}`,
    },
    { label: "Erstellt am", value: fmtDateTime(report.generatedAt) },
    { label: "Erstellt von", value: report.generatedBy ?? "—" },
    { label: "Anzahl Buchungen", value: report.transactionsCount },
    { spacer: true },
    { label: "Anfangssaldo Hauptkonto", value: report.openingMain, money: true },
    { label: "Anfangssaldo Global Grant", value: report.openingGG, money: true },
    { label: "Anfangssaldo gesamt", value: report.openingMain + report.openingGG, money: true },
    { spacer: true },
    { label: "Einnahmen Clubjahr", value: report.totalIncome, money: true },
    { label: "Ausgaben Clubjahr", value: report.totalExpense, money: true },
    { label: "Jahresergebnis (Netto)", value: report.netResult, money: true },
    { spacer: true },
    { label: "Endsaldo Hauptkonto", value: report.closingMain, money: true },
    { label: "Endsaldo Global Grant", value: report.closingGG, money: true },
    { label: "Endsaldo gesamt", value: report.closingMain + report.closingGG, money: true },
    { spacer: true },
    { label: "Offene Mitgliedsbeiträge", value: sumAmounts(report.openDues), money: true },
    { label: "Sonstige offene Forderungen", value: sumAmounts(report.openOtherInvoices), money: true },
    { label: "Offene Auslagen-Erstattungen", value: sumAmounts(report.expenseReimbursements), money: true },
  ];

  for (const k of kpis) {
    if ("spacer" in k) {
      cover.addRow([]);
      continue;
    }
    const row = cover.addRow([k.label, k.value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    if (k.money) {
      row.getCell(2).numFmt = eur;
      row.getCell(2).font = { bold: true };
    }
  }

  /* ============================ 2. Soll-Ist-Vergleich ============================ */
  const sollIst = wb.addWorksheet("Soll-Ist", {
    properties: { tabColor: { argb: ROTARY_GOLD } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sollIst.columns = [
    { header: "Kategorie", key: "name", width: 38 },
    { header: "Art", key: "kind", width: 14 },
    { header: "Budget (€)", key: "budget", width: 16, style: { numFmt: eur } },
    { header: "Ist (€)", key: "actual", width: 16, style: { numFmt: eur } },
    { header: "Δ Ist−Budget (€)", key: "delta", width: 18, style: { numFmt: eur } },
    { header: "Erfüllung", key: "pct", width: 12, style: { numFmt: "0.0%" } },
  ];
  styleHeader(sollIst.getRow(1));
  for (const r of report.sollIst) {
    const pct = r.budget !== 0 ? r.actual / r.budget : 0;
    const row = sollIst.addRow({
      name: r.categoryName,
      kind: r.kind === "INCOME" ? "Einnahme" : r.kind === "EXPENSE" ? "Ausgabe" : "Neutral",
      budget: r.budget,
      actual: r.actual,
      delta: r.delta,
      pct,
    });
    if (r.delta < 0 && r.kind === "INCOME") row.getCell("delta").font = { color: { argb: "FFB91C1C" } };
    if (r.delta > 0 && r.kind === "EXPENSE") row.getCell("delta").font = { color: { argb: "FFB91C1C" } };
  }
  // Summenzeile
  const sumRow = sollIst.addRow({
    name: "Σ gesamt",
    kind: "",
    budget: report.sollIstSum.budgetIn + report.sollIstSum.budgetOut,
    actual: report.sollIstSum.actualIn + report.sollIstSum.actualOut,
    delta:
      report.sollIstSum.actualIn + report.sollIstSum.actualOut -
      (report.sollIstSum.budgetIn + report.sollIstSum.budgetOut),
    pct: null,
  });
  sumRow.font = { bold: true };
  sumRow.eachCell((c) => {
    c.border = { top: { style: "medium" } };
  });

  /* ================================ 3. Buchungen ================================ */
  const tx = wb.addWorksheet("Buchungen", {
    properties: { tabColor: { argb: "FF0099CC" } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  tx.columns = [
    { header: "Datum", key: "date", width: 12, style: { numFmt: dateFmt } },
    { header: "Konto", key: "account", width: 8 },
    { header: "Gegenpartei", key: "cp", width: 32 },
    { header: "Verwendungszweck", key: "purpose", width: 42 },
    { header: "Kategorie", key: "category", width: 22 },
    { header: "Projekt", key: "project", width: 18 },
    { header: "Mitglied", key: "member", width: 22 },
    { header: "Betrag (€)", key: "amount", width: 14, style: { numFmt: eur } },
    { header: "Bank-Referenz", key: "ref", width: 24 },
  ];
  styleHeader(tx.getRow(1));
  for (const t of report.transactions) {
    const r = tx.addRow({
      date: t.date,
      account: t.accountType === "MAIN" ? "Haupt" : "GG",
      cp: t.counterparty ?? "",
      purpose: t.purpose ?? "",
      category: t.categoryName ?? "",
      project: t.projectCode ? `${t.projectCode}` : "",
      member: t.memberName ?? "",
      amount: t.amount,
      ref: t.externalRef ?? "",
    });
    if (t.amount < 0) r.getCell("amount").font = { color: { argb: "FFB91C1C" } };
    else if (t.amount > 0) r.getCell("amount").font = { color: { argb: "FF047857" } };
  }
  tx.autoFilter = { from: "A1", to: `I${tx.rowCount}` };

  /* ================================ 4. Projekte ================================ */
  const proj = wb.addWorksheet("Clubprojekte", {
    properties: { tabColor: { argb: "FFF7A81B" } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  proj.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Projekt", key: "name", width: 38 },
    { header: "Status", key: "status", width: 14 },
    { header: "Buchungen", key: "count", width: 11 },
    { header: "Einnahmen", key: "income", width: 16, style: { numFmt: eur } },
    { header: "Ausgaben", key: "expense", width: 16, style: { numFmt: eur } },
    { header: "Saldo", key: "balance", width: 16, style: { numFmt: eur } },
    { header: "Letzte Buchung", key: "last", width: 14, style: { numFmt: dateFmt } },
  ];
  styleHeader(proj.getRow(1));
  for (const p of report.projects) {
    const r = proj.addRow({
      code: p.code,
      name: p.name,
      status: p.isClosed ? "Abgeschlossen" : "Aktiv",
      count: p.count,
      income: p.income,
      expense: p.expense,
      balance: p.balance,
      last: p.lastBookingDate ?? null,
    });
    if (p.balance < 0) r.getCell("balance").font = { color: { argb: "FFB91C1C" }, bold: true };
    else r.getCell("balance").font = { color: { argb: "FF047857" }, bold: true };
  }
  // Summen-Zeile
  if (report.projects.length > 0) {
    const psum = report.projects.reduce(
      (a, p) => ({
        income: a.income + p.income,
        expense: a.expense + p.expense,
        balance: a.balance + p.balance,
      }),
      { income: 0, expense: 0, balance: 0 },
    );
    const r = proj.addRow({
      code: "",
      name: "Σ alle Projekte",
      status: "",
      count: "",
      income: psum.income,
      expense: psum.expense,
      balance: psum.balance,
      last: null,
    });
    r.font = { bold: true };
    r.eachCell((c) => {
      c.border = { top: { style: "medium" } };
    });
  }

  /* ============================ 5. Offene Mitgliedsbeiträge ============================ */
  addInvoiceSheet(wb, "Offene Beiträge", report.openDues, ROTARY_BLUE);

  /* ============================ 6. Sonstige offene Forderungen ============================ */
  addInvoiceSheet(wb, "Offene Forderungen", report.openOtherInvoices, "FF6366F1");

  /* ============================ 7. Auslagenbericht ============================ */
  const exp = wb.addWorksheet("Auslagenbericht", {
    properties: { tabColor: { argb: "FF10B981" } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  exp.columns = [
    { header: "Status", key: "status", width: 16 },
    { header: "Referenz", key: "ref", width: 16 },
    { header: "Mitglied", key: "member", width: 28 },
    { header: "Ausgestellt", key: "issued", width: 14, style: { numFmt: dateFmt } },
    { header: "Fällig", key: "due", width: 14, style: { numFmt: dateFmt } },
    { header: "Tage überfällig", key: "od", width: 14 },
    { header: "Betrag (€)", key: "amount", width: 14, style: { numFmt: eur } },
  ];
  styleHeader(exp.getRow(1));
  // Header row für offene Auslagen
  const hRow = exp.addRow({ status: "Offene Auslagen-Erstattungen" });
  hRow.font = { bold: true, italic: true, color: { argb: "FF334155" } };
  hRow.getCell("status").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: LIGHT_BG },
  };
  exp.mergeCells(`A${hRow.number}:G${hRow.number}`);

  for (const i of report.expenseReimbursements) {
    const r = exp.addRow({
      status: i.status,
      ref: i.reference,
      member: i.memberName ?? "",
      issued: i.issuedAt,
      due: i.dueDate ?? null,
      od: i.daysOverdue || "",
      amount: i.amount,
    });
    if (i.daysOverdue > 0) r.getCell("od").font = { color: { argb: "FFB91C1C" }, bold: true };
  }
  // Summe + ausbezahlte
  const expSumRow = exp.addRow({
    status: "Σ offen",
    amount: sumAmounts(report.expenseReimbursements),
  });
  expSumRow.font = { bold: true };
  expSumRow.eachCell((c) => (c.border = { top: { style: "medium" } }));

  exp.addRow([]);
  const paidRow = exp.addRow({
    status: "Bereits ausbezahlt (Clubjahr)",
    amount: report.paidExpenseReimbursementsAmount,
  });
  paidRow.font = { bold: true, color: { argb: "FF334155" } };

  /* ================================ Footer ================================ */
  // Fußzeilen-Hinweis auf Deckblatt
  cover.addRow([]);
  cover.addRow([]);
  const footerNote = cover.addRow([
    `Bericht generiert: ${fmtDateTime(report.generatedAt)}${report.generatedBy ? " · " + report.generatedBy : ""}`,
  ]);
  footerNote.font = { italic: true, color: { argb: "FF94A3B8" }, size: 9 };
  cover.mergeCells(`A${footerNote.number}:B${footerNote.number}`);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ----------------------------- Helfer ----------------------------- */

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.height = 22;
  row.eachCell((c) => {
    c.alignment = { vertical: "middle", horizontal: "left" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROTARY_BLUE } };
    c.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
}

function addInvoiceSheet(
  wb: ExcelJS.Workbook,
  name: string,
  invoices: TreasurerReport["openDues"],
  tabColor: string,
) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Referenz", key: "ref", width: 16 },
    { header: "Mitglied / Empfänger", key: "member", width: 30 },
    { header: "Status", key: "status", width: 14 },
    { header: "Ausgestellt", key: "issued", width: 14, style: { numFmt: "DD.MM.YYYY" } },
    { header: "Fällig", key: "due", width: 14, style: { numFmt: "DD.MM.YYYY" } },
    { header: "Tage überfällig", key: "od", width: 14 },
    { header: "Betrag (€)", key: "amount", width: 14, style: { numFmt: '#,##0.00 "€"' } },
  ];
  styleHeader(ws.getRow(1));
  for (const i of invoices) {
    const r = ws.addRow({
      ref: i.reference,
      member: i.memberName ?? "",
      status: i.status,
      issued: i.issuedAt,
      due: i.dueDate ?? null,
      od: i.daysOverdue || "",
      amount: i.amount,
    });
    if (i.daysOverdue > 0) r.getCell("od").font = { color: { argb: "FFB91C1C" }, bold: true };
    if (i.status === "REMINDED")
      r.getCell("status").font = { color: { argb: "FFD45F00" }, bold: true };
  }
  if (invoices.length > 0) {
    const sum = ws.addRow({
      ref: "",
      member: "Σ offen",
      status: "",
      amount: invoices.reduce((s, i) => s + i.amount, 0),
    });
    sum.font = { bold: true };
    sum.eachCell((c) => (c.border = { top: { style: "medium" } }));
  } else {
    const r = ws.addRow({ member: "(keine offenen Posten)" });
    r.font = { italic: true, color: { argb: "FF94A3B8" } };
  }
}

function sumAmounts(invoices: TreasurerReport["openDues"]) {
  return invoices.reduce((s, i) => s + i.amount, 0);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("de-AT", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("de-AT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}