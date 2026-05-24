import Link from "next/link";
import { getProjectTotals } from "@/lib/projectTotals";
import { formatEUR, formatDate } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight, FolderKanban, ChevronRight } from "lucide-react";
import { NewProjectButton } from "./ProjectsClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const totals = await getProjectTotals();
  const grandIncome = totals.reduce((s, p) => s + p.income, 0);
  const grandExpense = totals.reduce((s, p) => s + p.expense, 0);
  const grandBalance = grandIncome + grandExpense;

  return (
    <div className="space-y-5 sm:space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-amber-600">
            Clubprojekte
          </div>
          <h1 className="font-bold text-slate-900 mt-1">Projekte & Abrechnungen</h1>
          <p className="text-slate-500 text-sm sm:text-base">
            Eigene Abrechnung pro Projekt — z. B. RYLA, Weihnachtsaktion, Spendenprojekte.
          </p>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card-soft p-5 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">Einnahmen gesamt</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600 tabular">{formatEUR(grandIncome)}</div>
          </div>
          <ArrowUpRight className="text-emerald-400" />
        </div>
        <div className="card-soft p-5 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">Ausgaben gesamt</div>
            <div className="text-2xl font-bold mt-1 text-rose-600 tabular">{formatEUR(grandExpense)}</div>
          </div>
          <ArrowDownRight className="text-rose-400" />
        </div>
        <div className="card-soft p-5 flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">Saldo</div>
            <div className={`text-2xl font-bold mt-1 tabular ${grandBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatEUR(grandBalance)}
            </div>
          </div>
          <FolderKanban className="text-slate-400" />
        </div>
      </div>

      {/* Project list */}
      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2">
            <FolderKanban className="size-4 text-slate-500" />
            Alle Projekte
            <span className="text-xs font-normal text-slate-500">({totals.length})</span>
          </h3>
          <NewProjectButton />
        </div>

        {totals.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <FolderKanban className="size-8 mx-auto text-slate-300 mb-3" />
            <div className="font-medium">Noch keine Projekte angelegt.</div>
            <div className="text-sm mt-1">Lege das erste Projekt an, z. B. <span className="font-mono">RYLA26</span>.</div>
            <div className="mt-4">
              <NewProjectButton />
            </div>
          </div>
        ) : (
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Projekt</th>
                    <th className="whitespace-nowrap">Zeitraum</th>
                    <th className="text-right">Buchungen</th>
                    <th className="text-right">Einnahmen</th>
                    <th className="text-right">Ausgaben</th>
                    <th className="text-right">Saldo</th>
                    <th className="text-right">Status</th>
                    <th className="no-stack-label" />
                  </tr>
                </thead>
                <tbody>
                  {totals.map((p) => (
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
                        <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                          {p.name}
                        </Link>
                        {p.description && (
                          <div className="text-xs text-slate-500 truncate max-w-[280px]">{p.description}</div>
                        )}
                      </td>
                      <td data-label="Zeitraum" className="text-xs text-slate-600 whitespace-nowrap">
                        {p.startDate || p.endDate
                          ? `${p.startDate ? formatDate(p.startDate) : "…"} – ${p.endDate ? formatDate(p.endDate) : "…"}`
                          : "—"}
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
                      <td data-label="Status" className="text-right">
                        {p.isClosed ? (
                          <span className="chip bg-slate-100 text-slate-600">Abgeschlossen</span>
                        ) : (
                          <span className="chip bg-emerald-50 text-emerald-700">Aktiv</span>
                        )}
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
                    <td colSpan={4} className="font-semibold no-stack-label">Summe</td>
                    <td className="text-right font-mono tabular amount-pos font-semibold">{formatEUR(grandIncome)}</td>
                    <td className="text-right font-mono tabular amount-neg font-semibold">{formatEUR(grandExpense)}</td>
                    <td className={`text-right font-mono tabular font-bold ${grandBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatEUR(grandBalance)}
                    </td>
                    <td colSpan={2} className="no-stack-label" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}