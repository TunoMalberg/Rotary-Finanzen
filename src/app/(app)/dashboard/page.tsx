import { prisma } from "@/lib/prisma";
import { getAccountBalancesBatch, getCategoryTotals, getCurrentClubYear } from "@/lib/dataAccess";
import { computeRunningBalances } from "@/lib/runningBalance";
import { getProjectTotals } from "@/lib/projectTotals";
import { formatEUR, formatDate } from "@/lib/format";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Wallet, Mail, AlertTriangle, Receipt, FolderKanban, ChevronRight } from "lucide-react";
import { DashboardCharts } from "./DashboardCharts";
import { SollIstWidget, type SollIstRow } from "@/components/SollIstWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cy = await getCurrentClubYear();
  const now = new Date();

  // Alle unabhängigen Lookups parallel ausführen (vorher: ~12 sequenzielle Round-Trips)
  const [
    accounts,
    totals,
    allTotals,
    openAgg,
    overdueCount,
    recent,
    allCategories,
    budgetLines,
    projectTotals,
  ] = await Promise.all([
    prisma.account.findMany({ orderBy: { type: "asc" } }),
    getCategoryTotals(cy.id, "MAIN"),
    getCategoryTotals(cy.id),
    prisma.invoice.aggregate({
      where: { clubYearId: cy.id, status: { in: ["OPEN", "REMINDED"] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.count({
      where: { clubYearId: cy.id, status: { in: ["OPEN", "REMINDED"] }, dueDate: { lt: now } },
    }),
    prisma.transaction.findMany({
      where: { clubYearId: cy.id, deletedAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: { category: true, account: true, member: true },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.budgetLine.findMany({ where: { clubYearId: cy.id } }),
    getProjectTotals(),
  ]);
  const main = accounts.find((a) => a.type === "MAIN")!;
  const gg = accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST")!;

  // Saldi für beide Konten in EINER groupBy-Query
  const balMap = await getAccountBalancesBatch({
    clubYear: cy,
    accounts: accounts.map((a) => ({ id: a.id, type: a.type as "MAIN" | "GLOBAL_GRANT_TRUST" })),
  });
  const balMain = balMap.get(main.id) ?? 0;
  const balGG = balMap.get(gg.id) ?? 0;

  const income = totals.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = totals.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  const openInvoices = openAgg._count;
  const openInvoicesAmount = openAgg._sum.amount ?? 0;
  const overdueInvoices = overdueCount;

  // Running balance für Recent (separat, weil von `recent` abhängig)
  const recentBalanceMap = await computeRunningBalances({
    accountIds: [...new Set(recent.map((t) => t.accountId))],
    clubYearIds: [cy.id],
  });

  const sollIstRows: SollIstRow[] = allCategories.map((c) => {
    const line = budgetLines.find((l) => l.categoryId === c.id);
    const actual = allTotals.find((t) => t.id === c.id)?.amount ?? 0;
    return {
      categoryId: c.id,
      categoryName: c.name,
      kind: c.kind as SollIstRow["kind"],
      color: c.color,
      budget: line?.amount ?? 0,
      actual,
    };
  });

  const projectsIncome = projectTotals.reduce((s, p) => s + p.income, 0);
  const projectsExpense = projectTotals.reduce((s, p) => s + p.expense, 0);
  const projectsBalance = projectsIncome + projectsExpense;

  return (
    <div className="space-y-5 sm:space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-amber-600">
            Clubjahr {cy.label}
          </div>
          <h1 className="font-bold text-slate-900 mt-1">Finanzielle Gebahrung</h1>
          <p className="text-slate-500 text-sm sm:text-base">
            Rotary Club Wien-Donau · {formatDate(cy.startsAt)} – {formatDate(cy.endsAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap btn-row w-full sm:w-auto">
          <Link href="/transactions/new" className="btn-primary">
            <Receipt className="size-4" /> Neue Buchung
          </Link>
          <Link href="/import" className="btn-ghost">Bank-Import</Link>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Hauptkonto"
          value={formatEUR(balMain)}
          subtitle={main.iban ?? ""}
          color="blue"
          icon={<Wallet className="size-5" />}
          href="/transactions?account=main"
        />
        <KpiCard
          title="Global-Grant Treuhand"
          value={formatEUR(balGG)}
          subtitle={gg.iban ?? ""}
          color="gold"
          icon={<Wallet className="size-5" />}
          href="/transactions?account=gg"
        />
        <KpiCard
          title="Einnahmen Clubjahr"
          value={formatEUR(income)}
          subtitle={`${totals.filter((t) => t.amount > 0).length} Kategorien`}
          color="green"
          icon={<ArrowUpRight className="size-5" />}
        />
        <KpiCard
          title="Ausgaben Clubjahr"
          value={formatEUR(expense)}
          subtitle={`${totals.filter((t) => t.amount < 0).length} Kategorien`}
          color="red"
          icon={<ArrowDownRight className="size-5" />}
        />
      </div>

      {/* Forderungs-Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card-soft p-5 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">Offene Forderungen</div>
            <div className="text-2xl font-bold mt-1">{openInvoices}</div>
            <div className="text-sm text-slate-500 mt-1">{formatEUR(openInvoicesAmount)}</div>
          </div>
          <Mail className="text-slate-400" />
        </div>
        <div className="card-soft p-5 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">Überfällige Forderungen</div>
            <div className="text-2xl font-bold mt-1 text-rose-600">{overdueInvoices}</div>
            <div className="text-sm text-slate-500 mt-1">Mahnung erforderlich</div>
          </div>
          <AlertTriangle className="text-rose-400" />
        </div>
        <div className="card-soft p-5 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">Saldo gesamt</div>
            <div className="text-2xl font-bold mt-1">{formatEUR(balMain + balGG)}</div>
            <div className="text-sm text-slate-500 mt-1">Haupt + Global Grant</div>
          </div>
          <Wallet className="text-slate-400" />
        </div>
      </div>

      {/* Clubprojekte */}
      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2">
            <FolderKanban className="size-4 text-slate-500" />
            Clubprojekte
            <span className="text-xs font-normal text-slate-500">({projectTotals.length})</span>
          </h3>
          <Link href="/projects" className="text-sm text-blue-700 hover:underline whitespace-nowrap">
            Alle Projekte verwalten →
          </Link>
        </div>
        {projectTotals.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <FolderKanban className="size-8 mx-auto text-slate-300 mb-2" />
            <div className="text-sm">Noch keine Clubprojekte angelegt.</div>
            <Link href="/projects" className="btn-primary mt-3 inline-flex">
              Erstes Projekt anlegen
            </Link>
          </div>
        ) : (
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Projekt</th>
                    <th className="text-right">Buchungen</th>
                    <th className="text-right">Einnahmen</th>
                    <th className="text-right">Ausgaben</th>
                    <th className="text-right">Saldo</th>
                    <th className="no-stack-label" />
                  </tr>
                </thead>
                <tbody>
                  {projectTotals.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Code">
                        <span
                          className="chip font-mono text-[11px]"
                          style={{ background: `${p.color}1A`, color: p.color }}
                        >
                          {p.code}
                        </span>
                      </td>
                      <td data-label="Projekt">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.isClosed && (
                          <span className="ml-2 chip bg-slate-100 text-slate-600 text-[10px]">Abgeschlossen</span>
                        )}
                      </td>
                      <td data-label="Buchungen" className="text-right tabular">{p.count}</td>
                      <td data-label="Einnahmen" className="text-right font-mono tabular amount-pos">
                        {formatEUR(p.income)}
                      </td>
                      <td data-label="Ausgaben" className="text-right font-mono tabular amount-neg">
                        {formatEUR(p.expense)}
                      </td>
                      <td data-label="Saldo" className={`text-right font-mono tabular font-semibold ${p.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatEUR(p.balance)}
                      </td>
                      <td className="text-right no-stack-label">
                        <Link
                          href={`/projects/${p.id}`}
                          className="text-blue-700 hover:underline text-sm inline-flex items-center gap-1"
                        >
                          Abrechnung <ChevronRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={3} className="font-semibold no-stack-label">Summe</td>
                    <td className="text-right font-mono tabular amount-pos font-semibold">{formatEUR(projectsIncome)}</td>
                    <td className="text-right font-mono tabular amount-neg font-semibold">{formatEUR(projectsExpense)}</td>
                    <td className={`text-right font-mono tabular font-bold ${projectsBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatEUR(projectsBalance)}
                    </td>
                    <td className="no-stack-label" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Soll/Ist */}
      <SollIstWidget rows={sollIstRows} clubYearLabel={cy.label} />

      {/* Charts */}
      <DashboardCharts totals={totals} />

      {/* Recent transactions */}
      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b flex items-center justify-between gap-3">
          <h3 className="font-semibold">Letzte Buchungen</h3>
          <Link href="/transactions" className="text-sm text-blue-700 hover:underline whitespace-nowrap">
            Alle anzeigen →
          </Link>
        </div>
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Konto</th>
                  <th>Gegenpartei</th>
                  <th>Verwendungszweck</th>
                  <th>Kategorie</th>
                  <th className="text-right">Betrag</th>
                  <th className="text-right whitespace-nowrap" title="Kontosaldo nach dieser Buchung">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => {
                  const bal = recentBalanceMap.get(t.id);
                  return (
                    <tr key={t.id}>
                      <td data-label="Datum" className="whitespace-nowrap">{formatDate(t.date)}</td>
                      <td data-label="Konto"><span className="text-xs text-slate-500">{t.account.type === "MAIN" ? "Haupt" : "GG"}</span></td>
                      <td data-label="Gegenpartei" className="font-medium">{t.counterparty ?? "—"}</td>
                      <td data-label="Verwendungszweck" className="text-slate-600">{t.purpose ?? "—"}</td>
                      <td data-label="Kategorie">
                        {t.category ? (
                          <span className="chip" style={{ background: `${t.category.color}1A`, color: t.category.color }}>
                            {t.category.name}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td data-label="Betrag" className={`text-right font-mono tabular ${t.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                        {formatEUR(t.amount)}
                      </td>
                      <td data-label={t.account.type === "MAIN" ? "Saldo Haupt" : "Saldo GG"} className="text-right font-mono tabular text-slate-700 whitespace-nowrap">
                        {bal == null ? <span className="text-slate-300">—</span> : formatEUR(bal)}
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-500 py-10 no-stack-label">Noch keine Buchungen.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, subtitle, color, icon, href }: {
  title: string;
  value: string;
  subtitle?: string;
  color: "blue" | "gold" | "green" | "red";
  icon: React.ReactNode;
  href?: string;
}) {
  const accent = {
    blue: "linear-gradient(90deg,#17458F,#0099CC)",
    gold: "linear-gradient(90deg,#F7A81B,#D45F00)",
    green: "linear-gradient(90deg,#047857,#10b981)",
    red: "linear-gradient(90deg,#b91c1c,#ef4444)",
  }[color];
  const inner = (
    <div className="card-soft overflow-hidden">
      <div style={{ height: 4, background: accent }} />
      <div className="p-5">
        <div className="flex items-start justify-between text-slate-500">
          <span className="text-sm">{title}</span>
          <span className="text-slate-400">{icon}</span>
        </div>
        <div className="text-2xl font-bold mt-1 tabular text-slate-900">{value}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1 truncate">{subtitle}</div>}
      </div>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}