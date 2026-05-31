/**
 * Sammelt sämtliche Daten für den Schatzmeister-(Zwischen-)Abschluss
 * eines Clubjahres in einer einzigen, exportneutralen Form.
 *
 * Wird von Excel-, PPTX- und PDF-Exportern gleichermaßen konsumiert.
 */
import { prisma } from "./prisma";
import { getCategoryTotals } from "./dataAccess";
import { getProjectTotals, type ProjectTotal } from "./projectTotals";

export type TxRow = {
  id: string;
  date: Date;
  accountType: "MAIN" | "GLOBAL_GRANT_TRUST" | string;
  accountName: string;
  counterparty: string | null;
  purpose: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryKind: string | null;
  projectCode: string | null;
  projectName: string | null;
  memberName: string | null;
  amount: number;
  externalRef: string | null;
};

export type SollIst = {
  categoryId: string;
  categoryName: string;
  kind: string;
  color: string;
  budget: number;
  actual: number;
  delta: number; // actual - budget (signed)
};

/**
 * Detaillierte Projekt-Abrechnung: Liste aller Buchungen eines Clubprojekts
 * inklusive laufendem Saldo. Wird im Schatzmeister-Bericht pro aktivem
 * Projekt ausgewiesen.
 *
 * Hinweis: Buchungen werden über die gesamte Projekt-Lebensdauer aggregiert
 * (nicht nur Buchungen im aktuellen Clubjahr), damit die Abrechnung
 * konsistent mit dem CSV-Export pro Projekt bleibt.
 */
export type ProjectStatementRow = {
  date: Date;
  accountName: string;
  clubYearLabel: string;
  counterparty: string | null;
  purpose: string | null;
  categoryName: string | null;
  memberName: string | null;
  amount: number;
  runningBalance: number;
};

export type ProjectStatement = {
  projectId: string;
  code: string;
  name: string;
  color: string;
  description: string | null;
  isClosed: boolean;
  startDate: Date | null;
  endDate: Date | null;
  income: number;
  expense: number; // negative
  balance: number;
  count: number;
  rows: ProjectStatementRow[];
};

export type OpenInvoice = {
  id: string;
  reference: string;
  type: "DUES" | "EXPENSE" | string;
  status: "OPEN" | "REMINDED" | string;
  amount: number;
  dueDate: Date | null;
  issuedAt: Date;
  memberName: string | null;
  daysOverdue: number; // 0 wenn nicht überfällig
};

export type TreasurerReport = {
  club: {
    name: string;
    rcCode: string | null;
  };
  clubYear: {
    id: string;
    label: string;
    startsAt: Date;
    endsAt: Date;
    isClosed: boolean;
    lockedAt: Date | null;
  };
  generatedAt: Date;
  generatedBy: string | null;
  /** True wenn `as-of-Datum` < Jahres-Ende → Zwischenabschluss. */
  isInterim: boolean;
  asOf: Date;
  // Saldi
  openingMain: number;
  openingGG: number;
  closingMain: number;
  closingGG: number;
  // Aggregate (alle Konten zusammen, nur Buchungen im Clubjahr)
  totalIncome: number;
  totalExpense: number; // negativ
  netResult: number;
  // Soll/Ist (alle Kategorien)
  sollIst: SollIst[];
  sollIstSum: { budgetIn: number; actualIn: number; budgetOut: number; actualOut: number };
  // Buchungen
  transactions: TxRow[];
  transactionsCount: number;
  // Projekte (Übersicht)
  projects: ProjectTotal[];
  /**
   * Detaillierte Abrechnungen pro Clubprojekt mit allen Buchungen
   * (alle Clubjahre). Nur Projekte mit mindestens einer Buchung.
   */
  projectStatements: ProjectStatement[];
  // Forderungen
  openDues: OpenInvoice[];
  openOtherInvoices: OpenInvoice[];
  // Auslagen-Forderungen (an Mitglieder ausgestellt – „Auslagenbericht")
  // Hier: reimbursable EXPENSE-Invoices, die der Club auszahlen muss/musste.
  expenseReimbursements: OpenInvoice[]; // unbezahlt
  paidExpenseReimbursementsAmount: number; // ausbezahlt im Clubjahr
};

/** Hauptfunktion: Sammelt einen kompletten Bericht für ein Clubjahr. */
export async function collectTreasurerReport(opts: {
  clubYearId: string;
  generatedBy?: string | null;
  /** Optional: Stichtag (Default = jetzt). Wird nur für `isInterim` und Header genutzt. */
  asOf?: Date;
}): Promise<TreasurerReport> {
  const { clubYearId, generatedBy = null, asOf = new Date() } = opts;

  const cy = await prisma.clubYear.findUniqueOrThrow({ where: { id: clubYearId } });

  // Konten + Saldi
  const [main, gg] = await Promise.all([
    prisma.account.findFirst({ where: { type: "MAIN" } }),
    prisma.account.findFirst({ where: { type: "GLOBAL_GRANT_TRUST" } }),
  ]);
  const txSums = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { clubYearId, deletedAt: null },
    _sum: { amount: true },
  });
  const sumByAccount = new Map(txSums.map((s) => [s.accountId, s._sum.amount ?? 0]));
  const closingMain = (main ? cy.openingBalanceMain + (sumByAccount.get(main.id) ?? 0) : 0);
  const closingGG = (gg ? cy.openingBalanceGG + (sumByAccount.get(gg.id) ?? 0) : 0);

  // Buchungen (alle, sortiert)
  const txs = await prisma.transaction.findMany({
    where: { clubYearId, deletedAt: null },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      account: { select: { type: true, name: true } },
      category: { select: { id: true, name: true, color: true, kind: true } },
      project: { select: { id: true, code: true, name: true } },
      member: { select: { firstName: true, lastName: true } },
    },
  });

  const transactions: TxRow[] = txs.map((t) => ({
    id: t.id,
    date: t.date,
    accountType: t.account.type,
    accountName: t.account.name,
    counterparty: t.counterparty,
    purpose: t.purpose,
    categoryName: t.category?.name ?? null,
    categoryColor: t.category?.color ?? null,
    categoryKind: t.category?.kind ?? null,
    projectCode: t.project?.code ?? null,
    projectName: t.project?.name ?? null,
    memberName: t.member ? `${t.member.firstName} ${t.member.lastName}`.trim() : null,
    amount: t.amount,
    externalRef: t.externalRef,
  }));

  const totalIncome = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  // Soll/Ist über alle Kategorien
  const [allCategories, budgetLines, allTotals] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
    prisma.budgetLine.findMany({ where: { clubYearId } }),
    getCategoryTotals(clubYearId),
  ]);
  const sollIst: SollIst[] = allCategories.map((c) => {
    const line = budgetLines.find((l) => l.categoryId === c.id);
    const actual = allTotals.find((t) => t.id === c.id)?.amount ?? 0;
    const budget = line?.amount ?? 0;
    return {
      categoryId: c.id,
      categoryName: c.name,
      kind: c.kind,
      color: c.color,
      budget,
      actual,
      delta: actual - budget,
    };
  });

  const sollIstSum = sollIst.reduce(
    (acc, r) => {
      if (r.budget > 0) acc.budgetIn += r.budget;
      else if (r.budget < 0) acc.budgetOut += r.budget;
      if (r.actual > 0) acc.actualIn += r.actual;
      else if (r.actual < 0) acc.actualOut += r.actual;
      return acc;
    },
    { budgetIn: 0, actualIn: 0, budgetOut: 0, actualOut: 0 },
  );

  // Projekte (kompletter Verlauf)
  const projects = await getProjectTotals();

  // Pro Projekt eine Detail-Abrechnung – alle Buchungen über die gesamte
  // Projektlaufzeit, mit laufendem Saldo. Identische Logik wie der CSV-Export
  // unter /api/projects/:id/export.
  const projectsWithBookings = projects.filter((p) => p.count > 0);
  const projectStatementTxs =
    projectsWithBookings.length === 0
      ? []
      : await prisma.transaction.findMany({
          where: {
            projectId: { in: projectsWithBookings.map((p) => p.id) },
            deletedAt: null,
          },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          include: {
            account: { select: { name: true } },
            category: { select: { name: true } },
            member: { select: { firstName: true, lastName: true } },
            clubYear: { select: { label: true } },
          },
        });
  const projectStatements: ProjectStatement[] = projectsWithBookings.map((p) => {
    const items = projectStatementTxs.filter((t) => t.projectId === p.id);
    let run = 0;
    const rows: ProjectStatementRow[] = items.map((t) => {
      run += t.amount;
      return {
        date: t.date,
        accountName: t.account.name,
        clubYearLabel: t.clubYear.label,
        counterparty: t.counterparty,
        purpose: t.purpose,
        categoryName: t.category?.name ?? null,
        memberName: t.member ? `${t.member.firstName} ${t.member.lastName}`.trim() : null,
        amount: t.amount,
        runningBalance: run,
      };
    });
    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      color: p.color,
      description: p.description,
      isClosed: p.isClosed,
      startDate: p.startDate,
      endDate: p.endDate,
      income: p.income,
      expense: p.expense,
      balance: p.balance,
      count: p.count,
      rows,
    };
  });

  // Offene Forderungen (Mitgliedsbeiträge)
  const today = new Date(asOf);
  const today00 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const openInvoicesRaw = await prisma.invoice.findMany({
    where: {
      clubYearId,
      status: { in: ["OPEN", "REMINDED"] },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: {
      member: { select: { firstName: true, lastName: true } },
    },
  });
  const mapInvoice = (i: (typeof openInvoicesRaw)[number]): OpenInvoice => ({
    id: i.id,
    reference: i.reference,
    type: i.type,
    status: i.status,
    amount: i.amount,
    dueDate: i.dueDate,
    issuedAt: i.createdAt,
    memberName: i.member ? `${i.member.firstName} ${i.member.lastName}`.trim() : null,
    daysOverdue:
      i.dueDate && i.dueDate < today00
        ? Math.max(0, Math.floor((today00.getTime() - i.dueDate.getTime()) / (24 * 3600 * 1000)))
        : 0,
  });
  const openDues = openInvoicesRaw.filter((i) => i.type === "DUES").map(mapInvoice);
  const openOtherInvoices = openInvoicesRaw
    .filter((i) => i.type !== "DUES" && i.type !== "EXPENSE")
    .map(mapInvoice);
  const expenseReimbursements = openInvoicesRaw
    .filter((i) => i.type === "EXPENSE")
    .map(mapInvoice);

  // Bezahlte Auslagen (im Clubjahr)
  const paidExp = await prisma.invoice.aggregate({
    where: {
      clubYearId,
      type: "EXPENSE",
      status: "PAID",
      paidAt: { not: null },
    },
    _sum: { amount: true },
  });

  return {
    club: {
      name: "Rotary Club Wien-Donau",
      rcCode: null,
    },
    clubYear: {
      id: cy.id,
      label: cy.label,
      startsAt: cy.startsAt,
      endsAt: cy.endsAt,
      isClosed: cy.isClosed,
      lockedAt: cy.lockedAt,
    },
    generatedAt: new Date(),
    generatedBy,
    isInterim: asOf < cy.endsAt,
    asOf,
    openingMain: cy.openingBalanceMain,
    openingGG: cy.openingBalanceGG,
    closingMain,
    closingGG,
    totalIncome,
    totalExpense,
    netResult: totalIncome + totalExpense,
    sollIst,
    sollIstSum,
    transactions,
    transactionsCount: transactions.length,
    projects,
    projectStatements,
    openDues,
    openOtherInvoices,
    expenseReimbursements,
    paidExpenseReimbursementsAmount: paidExp._sum.amount ?? 0,
  };
}