/**
 * PDF-Export des Schatzmeister-Berichts.
 *
 * Verwendet pdfkit (low-level, server-side, ohne native Abhängigkeiten).
 * Charts werden als einfache Bar-Diagramme direkt mit Vektor-Primitiven
 * gezeichnet (kein chartjs-node-canvas, das auf Vercel schwierig wäre).
 */
import PDFDocument from "pdfkit";
import type { TreasurerReport, TxRow, OpenInvoice } from "../treasurerReport";

const ROTARY_BLUE = "#17458F";
const ROTARY_GOLD = "#F7A81B";
const ROTARY_DARK = "#0F2B5C";
const SLATE = "#334155";
const SLATE_LIGHT = "#94A3B8";
const SUCCESS = "#047857";
const DANGER = "#B91C1C";
const PALE_BG = "#F8FAFC";

const MARGIN = 40;
const FOOTER_H = 40;

export async function buildTreasurerPdf(report: TreasurerReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN + FOOTER_H, left: MARGIN, right: MARGIN },
      info: {
        Title: `Schatzmeister-Bericht ${report.clubYear.label}`,
        Author: report.generatedBy ?? "Rotary Finance",
        Subject: `${report.club.name} – ${report.isInterim ? "Zwischenabschluss" : "Jahresabschluss"} ${report.clubYear.label}`,
        CreationDate: report.generatedAt,
      },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      drawCover(doc, report);
      doc.addPage();
      drawExecutiveSummary(doc, report);
      doc.addPage();
      drawSollIst(doc, report);
      drawTransactionsList(doc, report);
      doc.addPage();
      drawProjects(doc, report);
      drawOpenDues(doc, report);
      drawOpenOther(doc, report);
      drawExpenseReimbursements(doc, report);

      // Footer auf alle Seiten
      stampFooters(doc, report);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/* ============================ DECKBLATT ============================ */

function drawCover(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  // Hintergrund
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(ROTARY_DARK);
  // Goldener Streifen
  doc.rect(0, doc.page.height / 2 - 1, doc.page.width, 2).fill(ROTARY_GOLD);

  doc.fillColor(ROTARY_GOLD)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("ROTARY CLUB WIEN-DONAU", MARGIN, 80, { characterSpacing: 4 });

  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(38)
    .text(r.isInterim ? "Zwischenabschluss" : "Jahresabschluss", MARGIN, 130);

  doc.fillColor("#FFFFFF")
    .font("Helvetica")
    .fontSize(20)
    .text("Bericht des Schatzmeisters", MARGIN, 200);

  doc.fillColor(ROTARY_GOLD)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(`Clubjahr ${r.clubYear.label}`, MARGIN, 240);

  doc.fillColor("#E2E8F0")
    .font("Helvetica")
    .fontSize(11)
    .text(
      `Berichtszeitraum: ${fmtDate(r.clubYear.startsAt)} – ${fmtDate(r.isInterim ? r.asOf : r.clubYear.endsAt)}`,
      MARGIN, 280,
    );

  // Footer-Block
  doc.fillColor("#94A3B8")
    .font("Helvetica-Oblique")
    .fontSize(9)
    .text(
      `Erstellt am ${fmtDateTime(r.generatedAt)}${r.generatedBy ? " · " + r.generatedBy : ""}`,
      MARGIN, doc.page.height - 80,
    );
}

/* ============================ EXECUTIVE SUMMARY ============================ */

function drawExecutiveSummary(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  drawSectionTitle(doc, "Executive Summary", "Kennzahlen auf einen Blick");

  // 4 KPI-Kacheln
  const kpis = [
    { label: "Hauptkonto Saldo", value: fmtEUR(r.closingMain), color: ROTARY_BLUE },
    { label: "Global Grant Saldo", value: fmtEUR(r.closingGG), color: ROTARY_GOLD },
    { label: "Einnahmen Clubjahr", value: fmtEUR(r.totalIncome), color: SUCCESS },
    { label: "Ausgaben Clubjahr", value: fmtEUR(r.totalExpense), color: DANGER },
  ];
  const tileW = (doc.page.width - 2 * MARGIN - 30) / 4;
  const tileH = 70;
  const tileY = doc.y + 10;
  for (let i = 0; i < kpis.length; i++) {
    const x = MARGIN + i * (tileW + 10);
    doc.roundedRect(x, tileY, tileW, tileH, 4).fill(PALE_BG);
    doc.fillColor(SLATE).font("Helvetica").fontSize(8).text(kpis[i].label, x + 8, tileY + 8, { width: tileW - 16 });
    doc.fillColor(kpis[i].color).font("Helvetica-Bold").fontSize(14).text(kpis[i].value, x + 8, tileY + 30, { width: tileW - 16 });
  }
  doc.y = tileY + tileH + 16;

  // Ergebnis-Box
  const resultColor = r.netResult >= 0 ? SUCCESS : DANGER;
  const resultBgColor = r.netResult >= 0 ? "#ECFDF5" : "#FEF2F2";
  doc.roundedRect(MARGIN, doc.y, doc.page.width - 2 * MARGIN, 50, 4).fill(resultBgColor);
  doc.strokeColor(resultColor).lineWidth(0.6).roundedRect(MARGIN, doc.y, doc.page.width - 2 * MARGIN, 50, 4).stroke();
  doc.fillColor(resultColor)
    .font("Helvetica-Bold").fontSize(18)
    .text(`Jahresergebnis (Netto): ${fmtEUR(r.netResult)}`, MARGIN + 16, doc.y + 14);
  doc.y += 60;

  // Kontensalden-Tabelle
  doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(12).text("Kontensalden", MARGIN, doc.y);
  doc.y += 8;
  drawTable(doc, {
    cols: [{ width: 280, label: "" }, { width: 110, label: "Anfang", align: "right" }, { width: 110, label: "Ende", align: "right" }],
    rows: [
      ["Hauptkonto", fmtEUR(r.openingMain), fmtEUR(r.closingMain)],
      ["Global Grant Treuhand", fmtEUR(r.openingGG), fmtEUR(r.closingGG)],
      ["Σ gesamt", fmtEUR(r.openingMain + r.openingGG), fmtEUR(r.closingMain + r.closingGG), "bold"],
    ],
  });
  doc.y += 16;

  // Offene Posten
  doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(12).text("Offene Posten", MARGIN, doc.y);
  doc.y += 8;
  drawTable(doc, {
    cols: [{ width: 320, label: "" }, { width: 60, label: "Anzahl", align: "right" }, { width: 120, label: "Betrag", align: "right" }],
    rows: [
      ["Mitgliedsbeiträge", String(r.openDues.length), fmtEUR(sumAmounts(r.openDues))],
      ["Sonstige Forderungen", String(r.openOtherInvoices.length), fmtEUR(sumAmounts(r.openOtherInvoices))],
      ["Auslagen-Erstattungen offen", String(r.expenseReimbursements.length), fmtEUR(sumAmounts(r.expenseReimbursements))],
    ],
  });
}

/* ============================ SOLL/IST ============================ */

function drawSollIst(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  drawSectionTitle(doc, "Soll/Ist – Budgetabgleich", "Budget vs. tatsächliche Ist-Werte");

  // Top-Kategorien als Bar-Diagramm
  const lines = [...r.sollIst]
    .filter((row) => Math.abs(row.budget) > 0 || Math.abs(row.actual) > 0)
    .sort((a, b) => Math.max(Math.abs(b.actual), Math.abs(b.budget)) - Math.max(Math.abs(a.actual), Math.abs(a.budget)))
    .slice(0, 10);

  if (lines.length > 0) {
    const chartH = 200;
    drawHorizontalBarChart(doc, {
      x: MARGIN,
      y: doc.y,
      w: doc.page.width - 2 * MARGIN,
      h: chartH,
      categories: lines.map((l) => l.categoryName),
      series: [
        { name: "Budget", color: ROTARY_BLUE, values: lines.map((l) => l.budget) },
        { name: "Ist", color: ROTARY_GOLD, values: lines.map((l) => l.actual) },
      ],
      title: "Top-Kategorien (nach max(|Budget|,|Ist|))",
    });
    doc.y += chartH + 20;
  }

  // Volle Soll/Ist-Tabelle
  doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(12).text("Soll/Ist – alle Kategorien", MARGIN, doc.y);
  doc.y += 8;
  drawTable(doc, {
    cols: [
      { width: 220, label: "Kategorie" },
      { width: 90, label: "Budget", align: "right" },
      { width: 90, label: "Ist", align: "right" },
      { width: 90, label: "Δ Ist−Budget", align: "right" },
    ],
    rows: r.sollIst.map((row) => [
      row.categoryName,
      fmtEUR(row.budget),
      fmtEUR(row.actual),
      { text: fmtEUR(row.delta), color: row.delta < 0 && row.kind === "INCOME" ? DANGER : row.delta > 0 && row.kind === "EXPENSE" ? DANGER : SLATE },
    ]),
    pageBreak: true,
  });
  // Summenzeile
  doc.y += 4;
  drawTable(doc, {
    cols: [
      { width: 220, label: "" },
      { width: 90, label: "", align: "right" },
      { width: 90, label: "", align: "right" },
      { width: 90, label: "", align: "right" },
    ],
    rows: [
      [
        { text: "Σ gesamt", bold: true },
        { text: fmtEUR(r.sollIstSum.budgetIn + r.sollIstSum.budgetOut), bold: true, align: "right" },
        { text: fmtEUR(r.sollIstSum.actualIn + r.sollIstSum.actualOut), bold: true, align: "right" },
        {
          text: fmtEUR((r.sollIstSum.actualIn + r.sollIstSum.actualOut) - (r.sollIstSum.budgetIn + r.sollIstSum.budgetOut)),
          bold: true, align: "right",
        },
      ],
    ],
    showHeader: false,
    rowFill: PALE_BG,
  });
}

/* ============================ TRANSACTIONS LIST ============================ */

function drawTransactionsList(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  doc.addPage();
  drawSectionTitle(doc, "Buchungsliste", `${r.transactionsCount} Buchungen im Clubjahr ${r.clubYear.label}`);

  const cols = [
    { width: 60, label: "Datum" },
    { width: 30, label: "Konto" },
    { width: 110, label: "Gegenpartei" },
    { width: 170, label: "Verwendungszweck" },
    { width: 90, label: "Kategorie" },
    { width: 60, label: "Betrag", align: "right" as const },
  ];
  drawTable(doc, {
    cols,
    rows: r.transactions.map((t: TxRow) => [
      fmtDate(t.date),
      t.accountType === "MAIN" ? "H" : "GG",
      truncate(t.counterparty ?? "—", 30),
      truncate(t.purpose ?? "—", 60),
      truncate(t.categoryName ?? "—", 22),
      { text: fmtEUR(t.amount), align: "right" as const, color: t.amount >= 0 ? SUCCESS : DANGER },
    ]),
    pageBreak: true,
    fontSize: 7.5,
  });
}

/* ============================ PROJEKTE ============================ */

function drawProjects(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  drawSectionTitle(doc, "Clubprojekte", "Einnahmen, Ausgaben und Saldo je Projekt (Gesamt-Verlauf)");

  if (r.projects.length === 0) {
    doc.fillColor(SLATE_LIGHT).font("Helvetica-Oblique").fontSize(11).text("Keine Projekte angelegt.", MARGIN, doc.y);
    doc.y += 30;
    return;
  }

  drawTable(doc, {
    cols: [
      { width: 60, label: "Code" },
      { width: 200, label: "Projekt" },
      { width: 60, label: "Status" },
      { width: 30, label: "#", align: "right" as const },
      { width: 80, label: "Einnahmen", align: "right" as const },
      { width: 80, label: "Ausgaben", align: "right" as const },
      { width: 80, label: "Saldo", align: "right" as const },
    ],
    rows: r.projects.map((p) => [
      p.code,
      truncate(p.name, 38),
      p.isClosed ? { text: "Abgeschl.", color: SLATE_LIGHT } : { text: "Aktiv", color: SUCCESS },
      String(p.count),
      { text: fmtEUR(p.income), align: "right" as const, color: SUCCESS },
      { text: fmtEUR(p.expense), align: "right" as const, color: DANGER },
      { text: fmtEUR(p.balance), align: "right" as const, bold: true, color: p.balance >= 0 ? SUCCESS : DANGER },
    ]),
    pageBreak: true,
  });
  // Summe
  const psum = r.projects.reduce(
    (a, p) => ({ income: a.income + p.income, expense: a.expense + p.expense, balance: a.balance + p.balance }),
    { income: 0, expense: 0, balance: 0 },
  );
  doc.y += 4;
  drawTable(doc, {
    cols: [
      { width: 60, label: "" },
      { width: 200, label: "" },
      { width: 60, label: "" },
      { width: 30, label: "", align: "right" as const },
      { width: 80, label: "", align: "right" as const },
      { width: 80, label: "", align: "right" as const },
      { width: 80, label: "", align: "right" as const },
    ],
    rows: [
      [
        "",
        { text: "Σ alle Projekte", bold: true },
        "",
        "",
        { text: fmtEUR(psum.income), align: "right" as const, bold: true, color: SUCCESS },
        { text: fmtEUR(psum.expense), align: "right" as const, bold: true, color: DANGER },
        { text: fmtEUR(psum.balance), align: "right" as const, bold: true, color: psum.balance >= 0 ? SUCCESS : DANGER },
      ],
    ],
    showHeader: false,
    rowFill: PALE_BG,
  });
  doc.y += 16;
}

/* ============================ OFFENE FORDERUNGEN ============================ */

function drawOpenDues(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  ensureSpace(doc, 100);
  drawSectionTitle(doc, "Offene Mitgliedsbeiträge", `Stand ${fmtDate(r.asOf)}`);
  drawInvoiceTable(doc, r.openDues, "Σ offene Beiträge");
}

function drawOpenOther(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  ensureSpace(doc, 100);
  drawSectionTitle(doc, "Sonstige offene Forderungen");
  drawInvoiceTable(doc, r.openOtherInvoices, "Σ sonstige offene Forderungen");
}

function drawExpenseReimbursements(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  ensureSpace(doc, 120);
  drawSectionTitle(doc, "Auslagenbericht", "Erstattungsforderungen der Mitglieder gegenüber dem Club");

  // KPI
  const tileW = (doc.page.width - 2 * MARGIN - 10) / 2;
  const tileH = 50;
  doc.roundedRect(MARGIN, doc.y, tileW, tileH, 4).fill("#FEF3C7");
  doc.fillColor(SLATE).font("Helvetica").fontSize(8).text("Offene Auslagen-Erstattungen", MARGIN + 8, doc.y + 8);
  doc.fillColor("#D45F00").font("Helvetica-Bold").fontSize(14)
    .text(`${fmtEUR(sumAmounts(r.expenseReimbursements))}  ·  ${r.expenseReimbursements.length} Posten`, MARGIN + 8, doc.y + 24);

  doc.roundedRect(MARGIN + tileW + 10, doc.y, tileW, tileH, 4).fill("#ECFDF5");
  doc.fillColor(SLATE).font("Helvetica").fontSize(8).text("Bereits ausbezahlt im Clubjahr", MARGIN + tileW + 18, doc.y + 8);
  doc.fillColor(SUCCESS).font("Helvetica-Bold").fontSize(14)
    .text(fmtEUR(r.paidExpenseReimbursementsAmount), MARGIN + tileW + 18, doc.y + 24);

  doc.y += tileH + 16;

  drawInvoiceTable(doc, r.expenseReimbursements, "Σ offene Auslagen");
}

function drawInvoiceTable(doc: PDFKit.PDFDocument, invoices: OpenInvoice[], sumLabel: string) {
  if (invoices.length === 0) {
    doc.fillColor(SUCCESS).font("Helvetica-Oblique").fontSize(11).text("✓ Keine offenen Posten.", MARGIN, doc.y);
    doc.y += 30;
    return;
  }
  drawTable(doc, {
    cols: [
      { width: 80, label: "Referenz" },
      { width: 160, label: "Mitglied" },
      { width: 60, label: "Status" },
      { width: 65, label: "Fällig" },
      { width: 50, label: "Tage", align: "right" as const },
      { width: 80, label: "Betrag", align: "right" as const },
    ],
    rows: invoices.map((i) => [
      i.reference,
      truncate(i.memberName ?? "—", 30),
      { text: i.status, color: i.status === "REMINDED" ? "#D45F00" : SLATE },
      i.dueDate ? fmtDate(i.dueDate) : "—",
      i.daysOverdue > 0
        ? { text: String(i.daysOverdue), align: "right" as const, color: DANGER, bold: true }
        : { text: "—", align: "right" as const },
      { text: fmtEUR(i.amount), align: "right" as const, bold: true },
    ]),
    pageBreak: true,
  });
  doc.y += 4;
  drawTable(doc, {
    cols: [
      { width: 80, label: "" }, { width: 160, label: "" }, { width: 60, label: "" },
      { width: 65, label: "" }, { width: 50, label: "" }, { width: 80, label: "" },
    ],
    rows: [[
      "", { text: sumLabel, bold: true }, "", "",
      { text: `${invoices.length}`, align: "right" as const, bold: true },
      { text: fmtEUR(sumAmounts(invoices)), align: "right" as const, bold: true },
    ]],
    showHeader: false,
    rowFill: PALE_BG,
  });
  doc.y += 16;
}

/* ============================ PRIMITIVE: TITLE / TABLE / CHART ============================ */

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.fillColor(ROTARY_BLUE).font("Helvetica-Bold").fontSize(18).text(title, MARGIN, doc.y);
  if (subtitle) {
    doc.moveDown(0.1);
    doc.fillColor(SLATE).font("Helvetica").fontSize(10).text(subtitle, MARGIN, doc.y);
  }
  doc.moveDown(0.3);
  doc.strokeColor("#E2E8F0").lineWidth(0.5)
    .moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).stroke();
  doc.y += 8;
}

type CellSimple = string;
type CellComplex = {
  text: string;
  bold?: boolean;
  align?: "left" | "right";
  color?: string;
};
type Cell = CellSimple | CellComplex;
type Col = { width: number; label: string; align?: "left" | "right" };
type TableOpts = {
  cols: Col[];
  rows: (Cell | "bold")[][];
  showHeader?: boolean;
  rowFill?: string;
  pageBreak?: boolean;
  fontSize?: number;
};

function drawTable(doc: PDFKit.PDFDocument, opts: TableOpts) {
  const fontSize = opts.fontSize ?? 9;
  const rowH = fontSize + 6;
  const padX = 4;
  const totalW = opts.cols.reduce((s, c) => s + c.width, 0);
  const startX = MARGIN;

  // Header
  if (opts.showHeader !== false) {
    doc.fillColor(ROTARY_BLUE).rect(startX, doc.y, totalW, rowH).fill(ROTARY_BLUE);
    let cx = startX;
    for (const col of opts.cols) {
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(fontSize)
        .text(col.label, cx + padX, doc.y + 3, {
          width: col.width - 2 * padX,
          align: col.align ?? "left",
        });
      cx += col.width;
    }
    doc.y += rowH;
  }

  // Rows
  for (const row of opts.rows) {
    if (opts.pageBreak && doc.y + rowH > doc.page.height - MARGIN - FOOTER_H) {
      doc.addPage();
      // Header neu zeichnen
      if (opts.showHeader !== false) {
        doc.fillColor(ROTARY_BLUE).rect(startX, doc.y, totalW, rowH).fill(ROTARY_BLUE);
        let cx = startX;
        for (const col of opts.cols) {
          doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(fontSize)
            .text(col.label, cx + padX, doc.y + 3, {
              width: col.width - 2 * padX,
              align: col.align ?? "left",
            });
          cx += col.width;
        }
        doc.y += rowH;
      }
    }
    if (opts.rowFill) {
      doc.rect(startX, doc.y, totalW, rowH).fill(opts.rowFill);
    }
    let cx = startX;
    for (let i = 0; i < opts.cols.length; i++) {
      const col = opts.cols[i];
      const cell = row[i] as Cell | "bold" | undefined;
      let text = "";
      let color = SLATE;
      let bold = false;
      let align = col.align ?? "left";
      if (typeof cell === "string") {
        text = cell;
      } else if (cell && typeof cell === "object") {
        text = cell.text;
        color = cell.color ?? SLATE;
        bold = !!cell.bold;
        if (cell.align) align = cell.align;
      }
      if (row.includes("bold")) bold = true;
      doc.fillColor(color).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize)
        .text(text, cx + padX, doc.y + 3, {
          width: col.width - 2 * padX,
          align,
          ellipsis: true,
          height: rowH - 4,
        });
      cx += col.width;
    }
    // Bottom border
    doc.strokeColor("#E2E8F0").lineWidth(0.3)
      .moveTo(startX, doc.y + rowH).lineTo(startX + totalW, doc.y + rowH).stroke();
    doc.y += rowH;
  }
}

type ChartSeries = { name: string; color: string; values: number[] };
function drawHorizontalBarChart(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number; y: number; w: number; h: number;
    categories: string[];
    series: ChartSeries[];
    title?: string;
  },
) {
  const { x, y, w, h, categories, series, title } = opts;
  const labelW = 140;
  const legendH = 22;
  const titleH = title ? 16 : 0;
  const chartX = x + labelW;
  const chartY = y + titleH;
  const chartW = w - labelW;
  const chartH = h - titleH - legendH;

  // Title
  if (title) {
    doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(10).text(title, x, y);
  }

  // Min/Max value
  const allVals = series.flatMap((s) => s.values);
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(0, ...allVals);
  const range = maxV - minV || 1;
  const zeroX = chartX + ((0 - minV) / range) * chartW;

  const rowH = chartH / categories.length;
  const barH = (rowH - 6) / series.length;

  // 0-Linie
  doc.strokeColor("#CBD5E1").lineWidth(0.5).moveTo(zeroX, chartY).lineTo(zeroX, chartY + chartH).stroke();

  // Bars + labels
  for (let i = 0; i < categories.length; i++) {
    // Label
    doc.fillColor(SLATE).font("Helvetica").fontSize(7.5)
      .text(truncate(categories[i], 26), x, chartY + i * rowH + 2, {
        width: labelW - 4, align: "right", height: rowH - 4,
      });
    // Bars per series
    for (let j = 0; j < series.length; j++) {
      const v = series[j].values[i];
      const barLen = (Math.abs(v) / range) * chartW;
      const barX = v >= 0 ? zeroX : zeroX - barLen;
      const barY = chartY + i * rowH + 3 + j * barH;
      doc.rect(barX, barY, barLen, barH - 1).fill(series[j].color);
    }
  }

  // Legend
  let legendX = x;
  const legendY = y + h - legendH + 6;
  doc.fontSize(8);
  for (const s of series) {
    doc.rect(legendX, legendY, 8, 8).fill(s.color);
    doc.fillColor(SLATE).font("Helvetica").text(s.name, legendX + 12, legendY - 1, { continued: false });
    legendX += 12 + doc.widthOfString(s.name) + 16;
  }
}

/* ============================ FOOTER ============================ */

function stampFooters(doc: PDFKit.PDFDocument, r: TreasurerReport) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === range.start) continue; // Cover hat eigenes Layout
    const y = doc.page.height - 30;
    doc.strokeColor("#E2E8F0").lineWidth(0.4)
      .moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8).stroke();
    doc.fillColor(SLATE_LIGHT).font("Helvetica").fontSize(8)
      .text(
        `${r.club.name} · Clubjahr ${r.clubYear.label} · ${r.isInterim ? "Zwischenabschluss" : "Jahresabschluss"}`,
        MARGIN, y - 2, { align: "left" },
      );
    doc.fillColor(SLATE_LIGHT).font("Helvetica").fontSize(8)
      .text(`Seite ${i - range.start} / ${range.count - 1}`, MARGIN, y - 2, {
        width: doc.page.width - 2 * MARGIN, align: "right",
      });
  }
}

/* ============================ HELPERS ============================ */

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN - FOOTER_H) {
    doc.addPage();
  }
}

function fmtDate(d: Date | string) {
  const dd = typeof d === "string" ? new Date(d) : d;
  return dd.toLocaleDateString("de-AT", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("de-AT", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function fmtEUR(n: number) {
  return n.toLocaleString("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function sumAmounts(arr: { amount: number }[]) {
  return arr.reduce((s, i) => s + i.amount, 0);
}
function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}