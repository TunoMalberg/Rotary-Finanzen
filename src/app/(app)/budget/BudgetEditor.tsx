"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatEUR } from "@/lib/format";
import { Save, Loader2, Copy } from "lucide-react";

type Row = { categoryId: string; categoryName: string; kind: string; color: string; sortOrder: number; budget: number; actual: number };

export function BudgetEditor({ initial, clubYearId, canEdit, allYears }: { initial: Row[]; clubYearId: string; canEdit: boolean; allYears: { id: string; label: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [saving, setSaving] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const incomes = rows.filter((r) => r.kind === "INCOME");
  const expenses = rows.filter((r) => r.kind === "EXPENSE");
  const totalBudgetIn = incomes.reduce((s, r) => s + r.budget, 0);
  const totalActualIn = incomes.reduce((s, r) => s + Math.max(0, r.actual), 0);
  const totalBudgetOut = expenses.reduce((s, r) => s + r.budget, 0);
  const totalActualOut = expenses.reduce((s, r) => s + Math.min(0, r.actual), 0);

  function setBudget(catId: string, val: string) {
    const n = Number(val.replace(",", "."));
    setRows((r) => r.map((x) => x.categoryId === catId ? { ...x, budget: Number.isFinite(n) ? n : 0 } : x));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubYearId, lines: rows.map((r) => ({ categoryId: r.categoryId, amount: r.budget })) }),
    });
    setSaving(false);
    router.refresh();
  }

  async function copyPrior() {
    if (!copyFrom) return;
    setSaving(true);
    await fetch("/api/budget/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetYearId: clubYearId, sourceYearId: copyFrom }) });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="card-soft p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <select aria-label="Vorjahr" className="input sm:max-w-xs" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Vorjahr wählen…</option>
            {allYears.filter((y) => y.id !== clubYearId).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
          <button onClick={copyPrior} disabled={!copyFrom || saving} className="btn-ghost">
            <Copy className="size-4" /> Aus Vorjahr kopieren
          </button>
          <div className="hidden sm:block sm:flex-1" />
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Budget speichern
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <Section title="Einnahmen" rows={incomes} setBudget={setBudget} canEdit={canEdit} positive />
        <Section title="Ausgaben" rows={expenses} setBudget={setBudget} canEdit={canEdit} positive={false} />
      </div>

      <div className="card-soft p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
        <Sum label="Einnahmen Soll vs Ist" budget={totalBudgetIn} actual={totalActualIn} />
        <Sum label="Ausgaben Soll vs Ist" budget={-totalBudgetOut} actual={totalActualOut} />
        <Sum label="Saldo Soll vs Ist" budget={totalBudgetIn - totalBudgetOut} actual={totalActualIn + totalActualOut} />
      </div>
    </div>
  );
}

function Section({ title, rows, setBudget, canEdit, positive }: { title: string; rows: Row[]; setBudget: (id: string, v: string) => void; canEdit: boolean; positive: boolean }) {
  return (
    <div className="card-soft overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b font-semibold flex items-center justify-between">
        {title}
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th className="text-right">Budget</th>
              <th className="text-right">Ist</th>
              <th className="text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actual = positive ? Math.max(0, r.actual) : Math.abs(Math.min(0, r.actual));
              const delta = actual - r.budget;
              const pct = r.budget > 0 ? (delta / r.budget) * 100 : 0;
              const colorClass = positive ? (delta >= 0 ? "amount-pos" : "amount-neg") : (delta <= 0 ? "amount-pos" : "amount-neg");
              return (
                <tr key={r.categoryId}>
                  <td>
                    <span className="chip" style={{ background: `${r.color}1A`, color: r.color }}>{r.categoryName}</span>
                  </td>
                  <td className="text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        aria-label={`Budget ${r.categoryName}`}
                        className="input text-right max-w-[160px] ml-auto font-mono"
                        value={r.budget}
                        onChange={(e) => setBudget(r.categoryId, e.target.value)}
                      />
                    ) : (
                      <span className="font-mono tabular">{formatEUR(r.budget)}</span>
                    )}
                  </td>
                  <td className="text-right font-mono tabular whitespace-nowrap">{formatEUR(actual)}</td>
                  <td className={`text-right font-mono tabular whitespace-nowrap ${colorClass}`}>
                    {delta >= 0 ? "+" : ""}{formatEUR(delta)}
                    {r.budget > 0 && <span className="text-xs ml-1 text-slate-400">({pct.toFixed(0)}%)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sum({ label, budget, actual }: { label: string; budget: number; actual: number }) {
  const delta = actual - budget;
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold mt-1 tabular">Soll: {formatEUR(budget)}</div>
      <div className="text-lg font-bold tabular">Ist: {formatEUR(actual)}</div>
      <div className={`text-sm font-semibold ${delta >= 0 ? "amount-pos" : "amount-neg"}`}>Δ {delta >= 0 ? "+" : ""}{formatEUR(delta)}</div>
    </div>
  );
}