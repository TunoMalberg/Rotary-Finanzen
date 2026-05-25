"use client";
import { CategoryDetailModal } from "@/components/CategoryDetailModal";
import { formatEUR } from "@/lib/format";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Year = { id: string; label: string };
type Cat = { name: string; kind: string; color: string; sortOrder: number };

export function ReportsView({
  years,
  categories,
  data,
}: {
  years: Year[];
  categories: Cat[];
  data: Record<string, Record<string, number>>;
}) {
  const [selectedYears, setSelectedYears] = useState<string[]>(
    years.slice(0, 2).map((y) => y.label),
  );
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [drill, setDrill] = useState<{
    year: string;
    category: string;
    color: string;
  } | null>(null);

  const cats = categories.filter((c) => c.kind === kind);
  const colorOf = (name: string) =>
    cats.find((c) => c.name === name)?.color ?? "#17458F";

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

  const yearColors = [
    "#17458F",
    "#F7A81B",
    "#0099CC",
    "#D41367",
    "#7B2D8E",
    "#00A28A",
  ];

  function toggleYear(label: string) {
    setSelectedYears((s) =>
      s.includes(label) ? s.filter((x) => x !== label) : [...s, label],
    );
  }

  function openDrill(year: string, category: string) {
    if (!year || !category) return;
    setDrill({ year, category, color: colorOf(category) });
  }

  // Custom tooltip with hint
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-lg bg-white shadow-lg border px-3 py-2 text-xs">
        <div className="font-semibold text-slate-700 mb-1">{label}</div>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span
              className="size-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-slate-600">{p.name}</span>
            <span className="ml-auto font-mono font-semibold">
              {formatEUR(Number(p.value))}
            </span>
          </div>
        ))}
        <div className="mt-1.5 pt-1.5 border-t text-[11px] text-slate-500 italic">
          Klick für Details
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card-soft p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs uppercase font-semibold text-slate-600 mr-1">
              Clubjahre:
            </span>
            {years.map((y, i) => (
              <button
                key={y.id}
                type="button"
                onClick={() => toggleYear(y.label)}
                aria-pressed={selectedYears.includes(y.label)}
                className={`chip ${selectedYears.includes(y.label) ? "" : "opacity-40"}`}
                style={{
                  background: `${yearColors[i % yearColors.length]}1A`,
                  color: yearColors[i % yearColors.length],
                  minHeight: 32,
                  padding: "0.3rem 0.75rem",
                }}
              >
                {y.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:block sm:flex-1" />
          <div
            role="tablist"
            className="flex gap-1 bg-slate-100 rounded-lg p-1 self-start sm:self-auto"
          >
            <button
              role="tab"
              aria-selected={kind === "INCOME"}
              onClick={() => setKind("INCOME")}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${kind === "INCOME" ? "bg-white text-blue-800 shadow" : "text-slate-600"}`}
              style={{ minHeight: 36 }}
            >
              Einnahmen
            </button>
            <button
              role="tab"
              aria-selected={kind === "EXPENSE"}
              onClick={() => setKind("EXPENSE")}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${kind === "EXPENSE" ? "bg-white text-blue-800 shadow" : "text-slate-600"}`}
              style={{ minHeight: 36 }}
            >
              Ausgaben
            </button>
          </div>
        </div>
      </div>

      <div className="card-soft p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold">
            {kind === "INCOME" ? "Einnahmen" : "Ausgaben"} – Vergleich
          </h3>
          <span className="text-[11px] text-slate-500 italic">
            Tipp: Auf einen Balken klicken für die Detail-Buchungen
          </span>
        </div>
        <ResponsiveContainer width="100%" height={340} minHeight={280}>
          <BarChart
            data={chartData}
            margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#eef0f4"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fill: "#64748b", fontSize: 10 }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10 }}
              width={48}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(23,69,143,0.06)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {selectedYears.map((y) => (
              <Bar
                key={y}
                dataKey={y}
                fill={
                  yearColors[
                    years.findIndex((yy) => yy.label === y) % yearColors.length
                  ]
                }
                radius={[4, 4, 0, 0]}
                style={{ cursor: "pointer" }}
                onClick={(d: {
                  name?: string;
                  payload?: { name?: string };
                }) => {
                  const catName = d?.payload?.name ?? d?.name;
                  if (catName) openDrill(y, catName);
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
          <span className="font-semibold">Detailtabelle</span>
          <span className="text-[11px] text-slate-500 italic">
            Tipp: Auf einen Betrag klicken für Detail-Buchungen
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kategorie</th>
                {selectedYears.map((y) => (
                  <th key={y} className="text-right">
                    {y}
                  </th>
                ))}
                <th className="text-right">
                  Δ ({selectedYears[selectedYears.length - 1]} vs{" "}
                  {selectedYears[0]})
                </th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const vals = selectedYears.map((y) => {
                  const v = data[y]?.[c.name] ?? 0;
                  return kind === "INCOME"
                    ? Math.max(0, v)
                    : Math.abs(Math.min(0, v));
                });
                const delta = vals[vals.length - 1] - vals[0];
                return (
                  <tr key={c.name}>
                    <td>
                      <span
                        className="chip"
                        style={{ background: `${c.color}1A`, color: c.color }}
                      >
                        {c.name}
                      </span>
                    </td>
                    {selectedYears.map((yLabel, i) => {
                      const v = vals[i];
                      return (
                        <td
                          key={yLabel}
                          className="text-right font-mono tabular p-0"
                        >
                          <button
                            type="button"
                            onClick={() => openDrill(yLabel, c.name)}
                            disabled={v === 0}
                            className="w-full text-right px-3 py-2 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-inherit transition-colors rounded"
                            title={
                              v === 0
                                ? "Keine Buchungen"
                                : `${c.name} · ${yLabel} · Details anzeigen`
                            }
                          >
                            {formatEUR(v)}
                          </button>
                        </td>
                      );
                    })}
                    <td
                      className={`text-right font-mono tabular ${delta >= 0 ? "amount-pos" : "amount-neg"}`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {formatEUR(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CategoryDetailModal
        open={drill !== null}
        onClose={() => setDrill(null)}
        year={drill?.year ?? null}
        category={drill?.category ?? null}
        kind={kind}
        color={drill?.color}
      />
    </div>
  );
}
