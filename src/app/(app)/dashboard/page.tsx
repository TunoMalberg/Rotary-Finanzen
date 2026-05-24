import { prisma } from "@/lib/prisma";
import { getAccountBalance, getCategoryTotals, getCurrentClubYear } from "@/lib/dataAccess";
import { computeRunningBalances } from "@/lib/runningBalance";
import { formatEUR, formatDate } from "@/lib/format";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Wallet, Mail, AlertTriangle, Receipt } from "lucide-react";
import { DashboardCharts } from "./DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cy = await getCurrentClubYear();
  const accounts = await prisma.account.findMany({ orderBy: { type: "asc" } });
  const main = accounts.find((a) => a.type === "MAIN")!;
  const gg = accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST")!;
  const [balMain, balGG] = await Promise.all([
    getAccountBalance(main.id, cy.id),
    getAccountBalance(gg.id, cy.id),
  ]);
  const totals = await getCategoryTotals(cy.id, "MAIN");
  const income = totals.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = totals.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  const openInvoices = await prisma.invoice.count({
    where: { clubYearId: cy.id, status: { in: ["OPEN", "REMINDED"] } },
  });
  const openInvoicesAmount = await prisma.invoice.aggregate({
    where: { clubYearId: cy.id, status: { in: ["OPEN", "REMINDED"] } },
    _sum: { amount: true },
  });
  const overdueInvoices = await prisma.invoice.count({
    where: { clubYearId: cy.id, status: { in: ["OPEN", "REMINDED"] }, dueDate: { lt: new Date() } },
  });

  const recent = await prisma.transaction.findMany({
    where: { clubYearId: cy.id, deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 8,
    include: { category: true, account: true, member: true },
  });
  const recentBalanceMap = await computeRunningBalances({
    accountIds: [...new Set(recent.map((t) => t.accountId))],
    clubYearIds: [cy.id],
  });

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
            <div className="text-sm text-slate-500 mt-1">{formatEUR(openInvoicesAmount._sum.amount ?? 0)}</div>
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