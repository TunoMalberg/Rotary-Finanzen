"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/format";

type Total = { id: string; name: string; kind: string; color: string; amount: number };

export function DashboardCharts({ totals }: { totals: Total[] }) {
  const incomes = totals.filter((t) => t.amount > 0).map((t) => ({ name: t.name, value: t.amount, color: t.color }));
  const expenses = totals.filter((t) => t.amount < 0).map((t) => ({ name: t.name, value: Math.abs(t.amount), color: t.color }));
  const all = [...totals]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10)
    .map((t) => ({ name: t.name.length > 18 ? t.name.slice(0, 16) + "…" : t.name, fullName: t.name, amount: t.amount, color: t.color }));

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card-soft p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Einnahmen / Ausgaben nach Kategorie</h3>
          <span className="text-xs text-slate-500">Top 10 nach Betrag · Hauptkonto</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={all} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v) => formatEUR(Number(v))}
              labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ""}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
              {all.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card-soft p-5">
        <h3 className="font-semibold mb-3">Einnahmen-Verteilung</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={incomes} dataKey="value" nameKey="name" innerRadius={48} outerRadius={84} paddingAngle={2}>
              {incomes.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatEUR(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-slate-500 space-y-1">
          {incomes.slice(0, 5).map((d) => (
            <div key={d.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block" style={{ background: d.color }} />
                {d.name}
              </span>
              <span className="tabular text-slate-700">{formatEUR(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}