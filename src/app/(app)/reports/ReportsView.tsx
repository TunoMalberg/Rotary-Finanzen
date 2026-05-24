"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEUR } from "@/lib/format";

type Year = { id: string; label: string };
type Cat = { name: string; kind: string; color: string; sortOrder: number };

export function ReportsView({ years, categories, data }: { years: Year[]; categories: Cat[]; data: Record<string, Record<string, number>> }) {
  const [selectedYears, setSelectedYears] = useState<string[]>(years.slice(0, 2).map((y) => y.label));
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("INCOME");

  const cats = categories.filter((c) => c.kind === kind);

  // chart data: one row per category, with one bar per year
  const chartData = cats.map((c) => {
    const row: Record<string, number | string> = { name: c.name };
    for (const y of selectedYears) {
      const map = data[y] ?? {};
      const v = map[c.name] ?? 0;
      row[y] = kind === "INCOME" ? Math.max(0, v) : Math.abs(Math.min(0, v));
    }
    return row;
  });

  const yearColors = ["#17458F", "#F7A81B", "#0099CC", "#D41367", "#7B2D8E", "#00A28A"];

  function toggleYear(label: string) {
    setSelectedYears((s) => s.includes(label) ? s.filter((x) => x !== label) : [...s, label]);
  }

  // table
  return (
    <div className="space-y-4">
      <div className="card-soft p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs uppercase font-semibold text-slate-600 mr-1">Clubjahre:</span>
            {years.map((y, i) => (
              <button
                key={y.id}
                type="button"
                onClick={() => toggleYear(y.label)}
                aria-pressed={selectedYears.includes(y.label)}
                className={`chip ${selectedYears.includes(y.label) ? "" : "opacity-40"}`}
                style={{ background: `${yearColors[i % yearColors.length]}1A`, color: yearColors[i % yearColors.length], minHeight: 32, padding: "0.3rem 0.75rem" }}
              >
                {y.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:block sm:flex-1" />
          <div role="tablist" className="flex gap-1 bg-slate-100 rounded-lg p-1 self-start sm:self-auto">
            <button role="tab" aria-selected={kind === "INCOME"} onClick={() => setKind("INCOME")} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${kind === "INCOME" ? "bg-white text-blue-800 shadow" : "text-slate-600"}`} style={{ minHeight: 36 }}>Einnahmen</button>
            <button role="tab" aria-selected={kind === "EXPENSE"} onClick={() => setKind("EXPENSE")} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${kind === "EXPENSE" ? "bg-white text-blue-800 shadow" : "text-slate-600"}`} style={{ minHeight: 36 }}>Ausgaben</button>
          </div>
        </div>
      </div>

      <div className="card-soft p-3 sm:p-5">
        <h3 className="font-semibold mb-3">{kind === "INCOME" ? "Einnahmen" : "Ausgaben"} – Vergleich</h3>
        <ResponsiveContainer width="100%" height={340} minHeight={280}>
          <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} width={48} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatEUR(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {selectedYears.map((y) => (
              <Bar key={y} dataKey={y} fill={yearColors[years.findIndex((yy) => yy.label === y) % yearColors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b font-semibold">Detailtabelle</div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kategorie</th>
                {selectedYears.map((y) => <th key={y} className="text-right">{y}</th>)}
                <th className="text-right">Δ ({selectedYears[selectedYears.length - 1]} vs {selectedYears[0]})</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const vals = selectedYears.map((y) => {
                  const v = data[y]?.[c.name] ?? 0;
                  return kind === "INCOME" ? Math.max(0, v) : Math.abs(Math.min(0, v));
                });
                const delta = vals[vals.length - 1] - vals[0];
                return (
                  <tr key={c.name}>
                    <td><span className="chip" style={{ background: `${c.color}1A`, color: c.color }}>{c.name}</span></td>
                    {vals.map((v, i) => <td key={i} className="text-right font-mono tabular">{formatEUR(v)}</td>)}
                    <td className={`text-right font-mono tabular ${delta >= 0 ? "amount-pos" : "amount-neg"}`}>{delta >= 0 ? "+" : ""}{formatEUR(delta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}