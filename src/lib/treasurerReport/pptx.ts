/**
 * PowerPoint-Export des Schatzmeister-Berichts (für Vorstandspräsentation).
 *
 * Folien:
 *  1. Deckblatt
 *  2. Executive Summary (KPI)
 *  3. Soll-Ist (Bar-Chart)
 *  4. Einnahmen/Ausgaben Verteilung (Donut)
 *  5. Clubprojekte (Tabelle)
 *  5a. Pro Clubprojekt: Detail-Abrechnung (Tabelle der Buchungen)
 *  6. Offene Mitgliedsbeiträge
 *  7. Auslagenbericht
 *  8. Buchungs-Übersicht (Top + Verweis auf Excel)
 *  9. Schlussfolie
 */
import PptxGenJS from "pptxgenjs";
import type { TreasurerReport } from "../treasurerReport";

const ROTARY_BLUE = "17458F";
const ROTARY_GOLD = "F7A81B";
const ROTARY_DARK = "0F2B5C";
const SLATE = "334155";
const SUCCESS = "047857";
const DANGER = "B91C1C";

export async function buildTreasurerPptx(report: TreasurerReport): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.author = report.generatedBy ?? "Rotary Finance";
  pres.company = report.club.name;
  pres.title = `Schatzmeister-Bericht ${report.clubYear.label}`;
  pres.subject = "Vorstands-Präsentation";
  pres.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 inch (16:9)

  // Master mit Footer
  pres.defineSlideMaster({
    title: "ROTARY",
    background: { fill: "FFFFFF" },
    slideNumber: { x: 12.5, y: 7.1, w: 0.7, h: 0.3, fontSize: 9, color: SLATE },
    objects: [
      {
        rect: { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: ROTARY_BLUE } },
      },
      {
        rect: { x: 0, y: 0.18, w: 13.333, h: 0.06, fill: { color: ROTARY_GOLD } },
      },
      {
        text: {
          text: `${report.club.name}  ·  Clubjahr ${report.clubYear.label}  ·  ${report.isInterim ? "Zwischenabschluss" : "Jahresabschluss"}`,
          options: { x: 0.4, y: 7.1, w: 11, h: 0.3, fontSize: 9, color: SLATE, italic: true },
        },
      },
    ],
  });

  /* ============================== 1. Deckblatt ============================== */
  {
    const s = pres.addSlide();
    s.background = { color: ROTARY_DARK };
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: 13.333, h: 7.5,
      fill: { color: ROTARY_DARK },
      line: { color: ROTARY_DARK },
    });
    s.addText("ROTARY CLUB WIEN-DONAU", {
      x: 0.7, y: 1.2, w: 12, h: 0.6,
      fontFace: "Calibri", fontSize: 18, bold: true,
      color: ROTARY_GOLD, charSpacing: 8,
    });
    s.addText(report.isInterim ? "Zwischenabschluss" : "Jahresabschluss", {
      x: 0.7, y: 2.0, w: 12, h: 1.0,
      fontFace: "Calibri", fontSize: 48, bold: true,
      color: "FFFFFF",
    });
    s.addText("Bericht des Schatzmeisters", {
      x: 0.7, y: 3.2, w: 12, h: 0.7,
      fontFace: "Calibri", fontSize: 28, color: "FFFFFF",
    });
    s.addText(`Clubjahr ${report.clubYear.label}`, {
      x: 0.7, y: 4.2, w: 12, h: 0.6,
      fontFace: "Calibri", fontSize: 22, bold: true,
      color: ROTARY_GOLD,
    });
    s.addText(
      `Berichtszeitraum: ${fmtDate(report.clubYear.startsAt)} – ${fmtDate(report.isInterim ? report.asOf : report.clubYear.endsAt)}`,
      { x: 0.7, y: 5.0, w: 12, h: 0.4, fontFace: "Calibri", fontSize: 14, color: "E2E8F0" },
    );
    s.addText(
      `Erstellt am ${fmtDateTime(report.generatedAt)}${report.generatedBy ? " · " + report.generatedBy : ""}`,
      { x: 0.7, y: 6.6, w: 12, h: 0.3, fontFace: "Calibri", fontSize: 11, color: "94A3B8", italic: true },
    );
  }

  /* ============================ 2. Executive Summary ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Executive Summary", "Kennzahlen auf einen Blick");

    const kpiRow = (i: number, label: string, value: string, color = SLATE) => {
      const x = 0.5 + i * 3.15;
      s.addShape(pres.ShapeType.roundRect, {
        x, y: 1.5, w: 2.95, h: 1.4,
        fill: { color: "F8FAFC" }, line: { color: "E2E8F0", width: 1 },
        rectRadius: 0.05,
      });
      s.addText(label, {
        x: x + 0.15, y: 1.55, w: 2.8, h: 0.35,
        fontFace: "Calibri", fontSize: 11, color: SLATE, bold: false,
      });
      s.addText(value, {
        x: x + 0.15, y: 1.95, w: 2.8, h: 0.85,
        fontFace: "Calibri", fontSize: 22, bold: true, color,
      });
    };
    kpiRow(0, "Hauptkonto Saldo", fmtEUR(report.closingMain), ROTARY_BLUE);
    kpiRow(1, "Global Grant Saldo", fmtEUR(report.closingGG), ROTARY_GOLD);
    kpiRow(2, "Einnahmen Clubjahr", fmtEUR(report.totalIncome), SUCCESS);
    kpiRow(3, "Ausgaben Clubjahr", fmtEUR(report.totalExpense), DANGER);

    // Ergebnis-Block
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.5, y: 3.1, w: 12.3, h: 1.0,
      fill: { color: report.netResult >= 0 ? "ECFDF5" : "FEF2F2" },
      line: { color: report.netResult >= 0 ? SUCCESS : DANGER, width: 1 },
      rectRadius: 0.05,
    });
    s.addText(
      `Jahresergebnis (Netto): ${fmtEUR(report.netResult)}`,
      {
        x: 0.7, y: 3.2, w: 11.9, h: 0.8,
        fontFace: "Calibri", fontSize: 22, bold: true,
        color: report.netResult >= 0 ? SUCCESS : DANGER,
      },
    );

    // Offene Posten
    const openTbl: PptxGenJS.TableRow[] = [
      [
        cell("Offene Posten", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Anzahl", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
        cell("Betrag", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      ],
      [
        cell("Mitgliedsbeiträge"),
        cell(`${report.openDues.length}`, { align: "right" }),
        cell(fmtEUR(sumAmounts(report.openDues)), { align: "right", bold: true }),
      ],
      [
        cell("Sonstige Forderungen"),
        cell(`${report.openOtherInvoices.length}`, { align: "right" }),
        cell(fmtEUR(sumAmounts(report.openOtherInvoices)), { align: "right", bold: true }),
      ],
      [
        cell("Auslagen-Erstattungen offen"),
        cell(`${report.expenseReimbursements.length}`, { align: "right" }),
        cell(fmtEUR(sumAmounts(report.expenseReimbursements)), { align: "right", bold: true }),
      ],
    ];
    s.addTable(openTbl, {
      x: 0.5, y: 4.3, w: 12.3,
      colW: [7.3, 2.0, 3.0],
      fontFace: "Calibri", fontSize: 13,
      border: { type: "solid", pt: 1, color: "E2E8F0" },
    });
  }

  /* ============================ 3. Soll-Ist Bar-Chart ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Soll/Ist – Budgetabgleich", "Budget vs. tatsächliche Ist-Werte je Kategorie");

    // Top 12 Kategorien nach absolutem Budget oder Ist
    const lines = [...report.sollIst]
      .filter((r) => Math.abs(r.budget) > 0 || Math.abs(r.actual) > 0)
      .sort((a, b) => Math.max(Math.abs(b.actual), Math.abs(b.budget)) - Math.max(Math.abs(a.actual), Math.abs(a.budget)))
      .slice(0, 12);
    const labels = lines.map((r) => r.categoryName.length > 28 ? r.categoryName.slice(0, 25) + "…" : r.categoryName);
    const budgetValues = lines.map((r) => Math.round(r.budget * 100) / 100);
    const actualValues = lines.map((r) => Math.round(r.actual * 100) / 100);

    s.addChart(pres.ChartType.bar, [
      { name: "Budget", labels, values: budgetValues },
      { name: "Ist", labels, values: actualValues },
    ], {
      x: 0.5, y: 1.4, w: 12.3, h: 5.4,
      barDir: "bar",
      barGrouping: "clustered",
      chartColors: [ROTARY_BLUE, ROTARY_GOLD],
      showLegend: true,
      legendPos: "b",
      catAxisLabelFontSize: 10,
      valAxisLabelFontSize: 10,
      valAxisLabelFormatCode: "#,##0 €",
      showTitle: false,
    });
  }

  /* ============================ 4. Einnahmen/Ausgaben ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Einnahmen & Ausgaben (Ist)", "Verteilung über alle Buchungen des Clubjahres");

    // Einnahmen
    const incomes = report.sollIst.filter((r) => r.actual > 0).sort((a, b) => b.actual - a.actual);
    const expenses = report.sollIst.filter((r) => r.actual < 0).sort((a, b) => a.actual - b.actual);

    if (incomes.length > 0) {
      s.addText("Einnahmen", {
        x: 0.5, y: 1.4, w: 6.0, h: 0.4,
        fontFace: "Calibri", fontSize: 14, bold: true, color: SUCCESS,
      });
      s.addChart(pres.ChartType.doughnut, [
        {
          name: "Einnahmen",
          labels: incomes.map((c) => c.categoryName),
          values: incomes.map((c) => Math.round(c.actual * 100) / 100),
        },
      ], {
        x: 0.5, y: 1.8, w: 6.0, h: 5.0,
        chartColors: chartPalette(incomes.length, "GREEN"),
        showLegend: true,
        legendPos: "r",
        legendFontSize: 9,
        showPercent: true,
        dataLabelFontSize: 9,
        holeSize: 50,
        showTitle: false,
      });
    }
    if (expenses.length > 0) {
      s.addText("Ausgaben", {
        x: 6.8, y: 1.4, w: 6.0, h: 0.4,
        fontFace: "Calibri", fontSize: 14, bold: true, color: DANGER,
      });
      s.addChart(pres.ChartType.doughnut, [
        {
          name: "Ausgaben",
          labels: expenses.map((c) => c.categoryName),
          values: expenses.map((c) => Math.abs(Math.round(c.actual * 100) / 100)),
        },
      ], {
        x: 6.8, y: 1.8, w: 6.0, h: 5.0,
        chartColors: chartPalette(expenses.length, "RED"),
        showLegend: true,
        legendPos: "r",
        legendFontSize: 9,
        showPercent: true,
        dataLabelFontSize: 9,
        holeSize: 50,
        showTitle: false,
      });
    }
  }

  /* ============================ 5. Clubprojekte ============================ */
  if (report.projects.length > 0) {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Clubprojekte", "Einnahmen, Ausgaben und Saldo je Projekt");

    const head: PptxGenJS.TableRow = [
      cell("Code", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Projekt", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Status", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("#", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      cell("Einnahmen", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      cell("Ausgaben", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      cell("Saldo", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
    ];
    const rows: PptxGenJS.TableRow[] = report.projects.slice(0, 18).map((p) => [
      cell(p.code, { fontFace: "Consolas" }),
      cell(p.name),
      cell(p.isClosed ? "Abgeschl." : "Aktiv", { color: p.isClosed ? "94A3B8" : SUCCESS }),
      cell(`${p.count}`, { align: "right" }),
      cell(fmtEUR(p.income), { align: "right", color: SUCCESS }),
      cell(fmtEUR(p.expense), { align: "right", color: DANGER }),
      cell(fmtEUR(p.balance), { align: "right", bold: true, color: p.balance >= 0 ? SUCCESS : DANGER }),
    ]);

    // Summenzeile
    const psum = report.projects.reduce(
      (a, p) => ({ income: a.income + p.income, expense: a.expense + p.expense, balance: a.balance + p.balance }),
      { income: 0, expense: 0, balance: 0 },
    );
    rows.push([
      cell(""),
      cell("Σ alle Projekte", { bold: true, fill: "F1F5F9" }),
      cell("", { fill: "F1F5F9" }),
      cell("", { align: "right", fill: "F1F5F9" }),
      cell(fmtEUR(psum.income), { align: "right", bold: true, color: SUCCESS, fill: "F1F5F9" }),
      cell(fmtEUR(psum.expense), { align: "right", bold: true, color: DANGER, fill: "F1F5F9" }),
      cell(fmtEUR(psum.balance), { align: "right", bold: true, color: psum.balance >= 0 ? SUCCESS : DANGER, fill: "F1F5F9" }),
    ]);

    s.addTable([head, ...rows], {
      x: 0.4, y: 1.4, w: 12.5,
      colW: [1.0, 4.6, 1.2, 0.7, 1.7, 1.7, 1.6],
      fontFace: "Calibri",
      fontSize: 10,
      border: { type: "solid", pt: 0.75, color: "E2E8F0" },
    });
  }

  /* ====================== 5a. Detail-Abrechnungen pro Projekt ====================== */
  for (const stmt of report.projectStatements) {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(
      s,
      `Projekt-Abrechnung: ${stmt.code} – ${truncate(stmt.name, 60)}`,
      stmt.description ? truncate(stmt.description, 120) : undefined,
    );

    // KPI-Box
    const kpiY = 1.25;
    const drawKpi = (xOff: number, label: string, val: string, color: string) => {
      s.addShape(pres.ShapeType.rect, {
        x: 0.4 + xOff,
        y: kpiY,
        w: 3.0,
        h: 0.65,
        fill: { color: "F1F5F9" },
        line: { color: "E2E8F0", width: 0.5 },
      });
      s.addText(label, {
        x: 0.5 + xOff,
        y: kpiY + 0.04,
        w: 2.8,
        h: 0.22,
        fontFace: "Calibri",
        fontSize: 9,
        color: SLATE,
      });
      s.addText(val, {
        x: 0.5 + xOff,
        y: kpiY + 0.26,
        w: 2.8,
        h: 0.36,
        fontFace: "Calibri",
        fontSize: 16,
        bold: true,
        color,
      });
    };
    drawKpi(0, "Einnahmen", fmtEUR(stmt.income), SUCCESS);
    drawKpi(3.2, "Ausgaben", fmtEUR(stmt.expense), DANGER);
    drawKpi(6.4, "Saldo", fmtEUR(stmt.balance), stmt.balance >= 0 ? SUCCESS : DANGER);
    drawKpi(9.6, "Buchungen", `${stmt.count}`, SLATE);

    // Detail-Buchungen (max. 18 Zeilen, damit es auf eine Folie passt)
    if (stmt.rows.length === 0) {
      s.addText("(keine Buchungen vorhanden)", {
        x: 0.5,
        y: 4.0,
        w: 12.3,
        h: 0.6,
        fontFace: "Calibri",
        fontSize: 14,
        italic: true,
        color: "94A3B8",
        align: "center",
      });
      continue;
    }

    const head: PptxGenJS.TableRow = [
      cell("Datum", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Konto", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Gegenpartei", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Verwendungszweck", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Mitglied", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Betrag", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      cell("Saldo", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
    ];

    const visible = stmt.rows.slice(0, 18);
    const dataRows: PptxGenJS.TableRow[] = visible.map((r) => [
      cell(fmtDate(r.date)),
      cell(
        r.accountName === "Hauptkonto"
          ? "Hauptkonto"
          : r.accountName.includes("Global")
            ? "GG"
            : truncate(r.accountName, 14),
      ),
      cell(truncate(r.counterparty ?? "—", 28)),
      cell(truncate(r.purpose ?? r.categoryName ?? "—", 38)),
      cell(truncate(r.memberName ?? "—", 18)),
      cell(fmtEUR(r.amount), {
        align: "right",
        color: r.amount < 0 ? DANGER : SUCCESS,
      }),
      cell(fmtEUR(r.runningBalance), {
        align: "right",
        bold: true,
        color: r.runningBalance < 0 ? DANGER : SLATE,
      }),
    ]);

    // Summenzeile
    dataRows.push([
      cell("", { fill: "F1F5F9" }),
      cell("", { fill: "F1F5F9" }),
      cell("", { fill: "F1F5F9" }),
      cell(
        stmt.rows.length > visible.length
          ? `… ${stmt.rows.length - visible.length} weitere Buchungen (siehe Excel)`
          : "",
        { fill: "F1F5F9", italic: true, color: "94A3B8", fontSize: 9 },
      ),
      cell("Σ Saldo", { fill: "F1F5F9", bold: true, align: "right" }),
      cell("", { fill: "F1F5F9" }),
      cell(fmtEUR(stmt.balance), {
        fill: "F1F5F9",
        align: "right",
        bold: true,
        color: stmt.balance >= 0 ? SUCCESS : DANGER,
      }),
    ]);

    s.addTable([head, ...dataRows], {
      x: 0.4,
      y: 2.05,
      w: 12.5,
      colW: [0.9, 1.1, 2.4, 3.3, 1.7, 1.4, 1.7],
      fontFace: "Calibri",
      fontSize: 9,
      border: { type: "solid", pt: 0.5, color: "E2E8F0" },
    });
  }

  /* ============================ 6. Offene Mitgliedsbeiträge ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Offene Mitgliedsbeiträge", `Stand ${fmtDate(report.asOf)}`);

    if (report.openDues.length === 0) {
      s.addText("✓ Keine offenen Mitgliedsbeiträge.", {
        x: 0.5, y: 3.2, w: 12.3, h: 1.0,
        fontFace: "Calibri", fontSize: 24, color: SUCCESS, align: "center",
      });
    } else {
      const head: PptxGenJS.TableRow = [
        cell("Mitglied", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Referenz", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Status", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Fällig", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Tage", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
        cell("Betrag", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      ];
      const rows: PptxGenJS.TableRow[] = report.openDues.slice(0, 22).map((i) => [
        cell(i.memberName ?? "—"),
        cell(i.reference),
        cell(i.status, { color: i.status === "REMINDED" ? "D45F00" : SLATE }),
        cell(i.dueDate ? fmtDate(i.dueDate) : "—"),
        cell(i.daysOverdue ? `${i.daysOverdue}` : "—", { align: "right", color: i.daysOverdue > 0 ? DANGER : SLATE, bold: i.daysOverdue > 0 }),
        cell(fmtEUR(i.amount), { align: "right", bold: true }),
      ]);
      // Summe
      rows.push([
        cell(""),
        cell(""),
        cell(""),
        cell("Σ offen", { bold: true, fill: "F1F5F9" }),
        cell(`${report.openDues.length}`, { align: "right", fill: "F1F5F9" }),
        cell(fmtEUR(sumAmounts(report.openDues)), { align: "right", bold: true, fill: "F1F5F9" }),
      ]);
      s.addTable([head, ...rows], {
        x: 0.4, y: 1.4, w: 12.5,
        colW: [3.6, 1.8, 1.4, 1.6, 1.0, 3.1],
        fontFace: "Calibri",
        fontSize: 11,
        border: { type: "solid", pt: 0.75, color: "E2E8F0" },
      });
    }
  }

  /* ============================ 7. Auslagenbericht ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Auslagenbericht", "Erstattungsforderungen der Mitglieder gegenüber dem Club");

    // KPI-Block
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.5, y: 1.4, w: 6.0, h: 1.2,
      fill: { color: "FEF3C7" }, line: { color: ROTARY_GOLD, width: 1 },
      rectRadius: 0.05,
    });
    s.addText([
      { text: "Offen ", options: { fontFace: "Calibri", fontSize: 11, color: SLATE } },
      { text: `(${report.expenseReimbursements.length} Posten)`, options: { fontFace: "Calibri", fontSize: 9, color: "94A3B8" } },
    ], { x: 0.7, y: 1.5, w: 5.6, h: 0.3 });
    s.addText(fmtEUR(sumAmounts(report.expenseReimbursements)), {
      x: 0.7, y: 1.85, w: 5.6, h: 0.7,
      fontFace: "Calibri", fontSize: 24, bold: true, color: "D45F00",
    });

    s.addShape(pres.ShapeType.roundRect, {
      x: 6.8, y: 1.4, w: 6.0, h: 1.2,
      fill: { color: "ECFDF5" }, line: { color: SUCCESS, width: 1 },
      rectRadius: 0.05,
    });
    s.addText("Bereits ausbezahlt im Clubjahr", {
      x: 7.0, y: 1.5, w: 5.6, h: 0.3,
      fontFace: "Calibri", fontSize: 11, color: SLATE,
    });
    s.addText(fmtEUR(report.paidExpenseReimbursementsAmount), {
      x: 7.0, y: 1.85, w: 5.6, h: 0.7,
      fontFace: "Calibri", fontSize: 24, bold: true, color: SUCCESS,
    });

    if (report.expenseReimbursements.length > 0) {
      const head: PptxGenJS.TableRow = [
        cell("Mitglied", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Referenz", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Ausgestellt", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
        cell("Tage offen", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
        cell("Betrag", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
      ];
      const rows: PptxGenJS.TableRow[] = report.expenseReimbursements.slice(0, 16).map((i) => [
        cell(i.memberName ?? "—"),
        cell(i.reference),
        cell(fmtDate(i.issuedAt)),
        cell(`${i.daysOverdue}`, { align: "right", color: i.daysOverdue > 30 ? DANGER : SLATE, bold: i.daysOverdue > 30 }),
        cell(fmtEUR(i.amount), { align: "right", bold: true }),
      ]);
      s.addTable([head, ...rows], {
        x: 0.4, y: 2.9, w: 12.5,
        colW: [4.0, 1.8, 1.7, 1.5, 3.5],
        fontFace: "Calibri",
        fontSize: 11,
        border: { type: "solid", pt: 0.75, color: "E2E8F0" },
      });
    } else {
      s.addText("✓ Keine offenen Auslagen-Erstattungen.", {
        x: 0.5, y: 3.5, w: 12.3, h: 1.0,
        fontFace: "Calibri", fontSize: 20, color: SUCCESS, align: "center",
      });
    }
  }

  /* ============================ 8. Buchungs-Übersicht ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Buchungen", `${report.transactionsCount} Buchungen im Clubjahr · Top 15 nach Betrag`);

    const top = [...report.transactions]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 15);

    const head: PptxGenJS.TableRow = [
      cell("Datum", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Gegenpartei", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Zweck", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Kategorie", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF" }),
      cell("Betrag", { bold: true, fill: ROTARY_BLUE, color: "FFFFFF", align: "right" }),
    ];
    const rows: PptxGenJS.TableRow[] = top.map((t) => [
      cell(fmtDate(t.date)),
      cell(t.counterparty ?? "—"),
      cell(t.purpose ? (t.purpose.length > 50 ? t.purpose.slice(0, 47) + "…" : t.purpose) : "—"),
      cell(t.categoryName ?? "—", { color: t.categoryColor ?? SLATE }),
      cell(fmtEUR(t.amount), { align: "right", bold: true, color: t.amount >= 0 ? SUCCESS : DANGER }),
    ]);
    s.addTable([head, ...rows], {
      x: 0.4, y: 1.4, w: 12.5,
      colW: [1.3, 3.0, 4.5, 2.0, 1.7],
      fontFace: "Calibri",
      fontSize: 9,
      border: { type: "solid", pt: 0.75, color: "E2E8F0" },
    });
    s.addText("Vollständige Buchungsliste siehe Excel-Export.", {
      x: 0.4, y: 6.7, w: 12.5, h: 0.3,
      fontFace: "Calibri", fontSize: 10, italic: true, color: "64748B",
    });
  }

  /* ============================ 9. Schlussfolie ============================ */
  {
    const s = pres.addSlide({ masterName: "ROTARY" });
    addTitle(s, "Zusammenfassung & Ausblick");

    const bullets = buildSummaryBullets(report);
    s.addText(bullets.map((b) => ({ text: b, options: { bullet: { type: "bullet" }, paraSpaceAfter: 8 } })), {
      x: 0.7, y: 1.5, w: 12.0, h: 4.5,
      fontFace: "Calibri", fontSize: 16, color: SLATE,
    });

    s.addText("Vielen Dank für Ihre Aufmerksamkeit.", {
      x: 0.5, y: 6.2, w: 12.3, h: 0.5,
      fontFace: "Calibri", fontSize: 16, italic: true, color: ROTARY_BLUE, align: "center",
    });
  }

  // pptxgenjs.write() returns Buffer in Node, ArrayBuffer in browser
  const out = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return out;
}

/* ----------------------------- Helfer ----------------------------- */

function addTitle(s: PptxGenJS.Slide, title: string, subtitle?: string) {
  s.addText(title, {
    x: 0.4, y: 0.4, w: 12.5, h: 0.6,
    fontFace: "Calibri", fontSize: 24, bold: true, color: ROTARY_BLUE,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.4, y: 0.95, w: 12.5, h: 0.35,
      fontFace: "Calibri", fontSize: 13, color: SLATE,
    });
  }
}

type CellOpts = {
  bold?: boolean;
  italic?: boolean;
  fill?: string;
  color?: string;
  align?: "left" | "center" | "right";
  fontFace?: string;
  fontSize?: number;
};
function cell(text: string, opts: CellOpts = {}): PptxGenJS.TableCell {
  return {
    text: String(text ?? ""),
    options: {
      bold: opts.bold,
      italic: opts.italic,
      align: opts.align ?? "left",
      color: opts.color ?? SLATE,
      fill: opts.fill ? { color: opts.fill } : undefined,
      fontFace: opts.fontFace ?? "Calibri",
      fontSize: opts.fontSize ?? 11,
      valign: "middle",
      margin: 0.05,
    },
  };
}

function chartPalette(n: number, hint: "GREEN" | "RED"): string[] {
  // Sanfte Tönungen rund um Rotary-Töne
  const greens = ["047857", "10B981", "059669", "065F46", "34D399", "6EE7B7", "84CC16", "16A34A", "22C55E", "15803D", "0E7490", "0891B2"];
  const reds = ["B91C1C", "DC2626", "EF4444", "991B1B", "F87171", "F59E0B", "D45F00", "C2410C", "9A3412", "7C2D12", "F472B6", "DB2777"];
  const base = hint === "GREEN" ? greens : reds;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}

function fmtDate(d: Date | string) {
  const dd = typeof d === "string" ? new Date(d) : d;
  return dd.toLocaleDateString("de-AT", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("de-AT", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtEUR(n: number) {
  return n.toLocaleString("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function sumAmounts(arr: { amount: number }[]) {
  return arr.reduce((s, i) => s + i.amount, 0);
}

function buildSummaryBullets(r: TreasurerReport): string[] {
  const bullets: string[] = [];
  bullets.push(
    `Gesamtsaldo zum Stichtag ${fmtDate(r.asOf)}: ${fmtEUR(r.closingMain + r.closingGG)} (Hauptkonto ${fmtEUR(r.closingMain)} + Global Grant ${fmtEUR(r.closingGG)}).`,
  );
  bullets.push(
    `Im Clubjahr wurden ${r.transactionsCount} Buchungen erfasst – Einnahmen ${fmtEUR(r.totalIncome)}, Ausgaben ${fmtEUR(r.totalExpense)}, Netto-Ergebnis ${fmtEUR(r.netResult)}.`,
  );
  // Offene Posten
  const openTotal = sumAmounts(r.openDues) + sumAmounts(r.openOtherInvoices) + sumAmounts(r.expenseReimbursements);
  if (openTotal > 0) {
    bullets.push(
      `Offene Posten gesamt: ${fmtEUR(openTotal)} (${r.openDues.length} Mitgliedsbeiträge, ${r.openOtherInvoices.length} sonstige Forderungen, ${r.expenseReimbursements.length} Auslagen-Erstattungen).`,
    );
  } else {
    bullets.push("Keine offenen Forderungen oder Auslagen-Erstattungen.");
  }
  // Soll/Ist
  const overspentExpense = r.sollIst.filter((s) => s.kind === "EXPENSE" && s.budget < 0 && s.actual < s.budget);
  if (overspentExpense.length > 0) {
    const top = overspentExpense.sort((a, b) => a.delta - b.delta)[0];
    bullets.push(
      `Budget-Überschreitung in Kategorie „${top.categoryName}": Ist ${fmtEUR(top.actual)} vs. Budget ${fmtEUR(top.budget)} (Δ ${fmtEUR(top.delta)}).`,
    );
  }
  // Projekte
  if (r.projects.length > 0) {
    const active = r.projects.filter((p) => !p.isClosed);
    bullets.push(`${active.length} aktive Clubprojekte mit Gesamt-Saldo ${fmtEUR(active.reduce((s, p) => s + p.balance, 0))}.`);
  }
  bullets.push(
    r.isInterim
      ? "Dieser Bericht ist ein Zwischenstand und ersetzt nicht den endgültigen Jahresabschluss."
      : "Dieser Bericht stellt den Stand zum Ende des Clubjahres dar.",
  );
  return bullets;
}
function truncate(s: string, max: number) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}
