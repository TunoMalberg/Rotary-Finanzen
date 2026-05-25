import Link from "next/link";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatEUR } from "@/lib/format";

export type SollIstRow = {
  categoryId: string;
  categoryName: string;
  kind: "INCOME" | "EXPENSE" | "NEUTRAL";
  color: string;
  budget: number;
  actual: number;
};

/**
 * Kompakter Soll/Ist-Block: zeigt Σ Einnahmen/Ausgaben/Saldo Soll vs Ist
 * sowie pro Kategorie die größten Abweichungen. Rein server-rendered.
 */
export function SollIstWidget({ rows, clubYearLabel }: { rows: SollIstRow[]; clubYearLabel: string }) {
  const incomes = rows.filter((r) => r.kind === "INCOME");
  const expenses = rows.filter((r) => r.kind === "EXPENSE");
  const sumBudgetIn = incomes.reduce((s, r) => s + r.budget, 0);
  const sumActualIn = incomes.reduce((s, r) => s + Math.max(0, r.actual), 0);
  const sumBudgetOut = expenses.reduce((s, r) => s + r.budget, 0);
  const sumActualOut = expenses.reduce((s, r) => s + Math.abs(Math.min(0, r.actual)), 0);
  const totalProgress = sumBudgetOut > 0 ? Math.min(100, Math.round((sumActualOut / sumBudgetOut) * 100)) : 0;

  // Top abweichende Positionen
  const allWithBudget = rows.filter((r) => r.budget > 0);
  const top = allWithBudget
    .map((r) => {
      const istAbs = r.kind === "INCOME" ? Math.max(0, r.actual) : Math.abs(Math.min(0, r.actual));
      const delta = istAbs - r.budget;
      const pct = r.budget > 0 ? (delta / r.budget) * 100 : 0;
      return { ...r, istAbs, delta, pct };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);

  return (
    <div className="card-soft p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-blue-800" />
          <h3 className="font-semibold">Soll/Ist-Vergleich · {clubYearLabel}</h3>
        </div>
        <Link href="/budget" className="text-sm text-blue-700 hover:underline whitespace-nowrap">
          Budget öffnen →
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SollIstKpi label="Einnahmen" budget={sumBudgetIn} actual={sumActualIn} positive />
        <SollIstKpi label="Ausgaben" budget={sumBudgetOut} actual={sumActualOut} positive={false} />
        <SollIstKpi label="Saldo" budget={sumBudgetIn - sumBudgetOut} actual={sumActualIn - sumActualOut} positive />
      </div>

      {/* Ausgaben-Bar */}
      {sumBudgetOut > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Ausgaben-Verbrauch</span>
            <span className="font-mono">{totalProgress}% · {formatEUR(sumActualOut)} / {formatEUR(sumBudgetOut)}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${totalProgress > 100 ? "bg-red-500" : totalProgress > 90 ? "bg-amber-500" : "bg-blue-700"}`}
              style={{ width: `${Math.min(100, totalProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Top Abweichungen */}
      {top.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Größte Abweichungen vs Plan</h4>
          <ul className="space-y-1.5">
            {top.map((r) => (
              <li key={r.categoryId} className="flex items-center justify-between gap-3 text-sm">
                <span className="chip text-xs" style={{ background: `${r.color}1A`, color: r.color }}>{r.categoryName}</span>
                <span className="font-mono tabular text-slate-600">{formatEUR(r.istAbs)} / {formatEUR(r.budget)}</span>
                <span className={`font-mono tabular text-xs inline-flex items-center gap-0.5 ${r.delta >= 0 ? (r.kind === "INCOME" ? "text-emerald-700" : "text-red-700") : (r.kind === "INCOME" ? "text-red-700" : "text-emerald-700")}`}>
                  {r.delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {r.delta >= 0 ? "+" : ""}{formatEUR(r.delta)}
                  {r.budget > 0 && <span className="text-slate-400 ml-1">({r.pct.toFixed(0)}%)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SollIstKpi({ label, budget, actual, positive }: { label: string; budget: number; actual: number; positive: boolean }) {
  const delta = actual - budget;
  const ratio = budget > 0 ? (actual / budget) * 100 : 0;
  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/60">
      <div className="text-xs uppercase text-slate-500 mb-0.5">{label}</div>
      <div className="text-lg font-bold tabular leading-tight">{formatEUR(actual)}</div>
      <div className="text-xs text-slate-500">Plan: <span className="tabular">{formatEUR(budget)}</span> {budget > 0 && <span className="ml-1">({ratio.toFixed(0)}%)</span>}</div>
      <div className={`text-xs font-semibold mt-0.5 ${positive ? (delta >= 0 ? "amount-pos" : "amount-neg") : (delta <= 0 ? "amount-pos" : "amount-neg")}`}>
        Δ {delta >= 0 ? "+" : ""}{formatEUR(delta)}
      </div>
    </div>
  );
}