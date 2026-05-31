"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, TrendingUp, AlertTriangle, Calendar } from "lucide-react";
import { formatEUR } from "@/lib/format";

type Point = {
  date: string;
  main: number;
  gg: number;
  total: number;
  delta: number;
};

type ApiResp = {
  from: string;
  to: string;
  startBalance: { main: number; gg: number; total: number };
  series: Point[];
};

type Preset = { id: string; label: string; offset: () => string };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rotaryYearStartIso(): string {
  const today = new Date();
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-07-01`;
}

function shiftIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS: Preset[] = [
  { id: "cy", label: "Lfd. Clubjahr", offset: rotaryYearStartIso },
  { id: "1m", label: "1 Monat", offset: () => shiftIso(1) },
  { id: "3m", label: "3 Monate", offset: () => shiftIso(3) },
  { id: "6m", label: "6 Monate", offset: () => shiftIso(6) },
  { id: "12m", label: "12 Monate", offset: () => shiftIso(12) },
  { id: "ytd", label: `Seit 1.1.${new Date().getFullYear()}`, offset: () => `${new Date().getFullYear()}-01-01` },
  { id: "all", label: "Alles", offset: () => "" },
];

export function AssetEvolutionChart() {
  const [from, setFrom] = useState<string>(rotaryYearStartIso());
  const [to, setTo] = useState<string>(todayIso());
  const [preset, setPreset] = useState<string>("cy");
  const [data, setData] = useState<ApiResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setBusy(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/cashflow/daily-balance?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Fehler ${res.status}`);
        }
        return res.json();
      })
      .then((j: ApiResp) => {
        if (!aborted) setData(j);
      })
      .catch((e: unknown) => {
        if (!aborted) setError(e instanceof Error ? e.message : "Fehler");
      })
      .finally(() => {
        if (!aborted) setBusy(false);
      });
    return () => {
      aborted = true;
    };
  }, [from, to]);

  const stats = useMemo(() => {
    if (!data?.series.length) return null;
    const last = data.series[data.series.length - 1];
    const first = data.series[0];
    let min = last.total;
    let max = last.total;
    let minDate = last.date;
    let maxDate = last.date;
    for (const p of data.series) {
      if (p.total < min) {
        min = p.total;
        minDate = p.date;
      }
      if (p.total > max) {
        max = p.total;
        maxDate = p.date;
      }
    }
    return {
      currentTotal: last.total,
      currentMain: last.main,
      currentGg: last.gg,
      startTotal: data.startBalance.total,
      changeAbs: last.total - data.startBalance.total,
      changePct: data.startBalance.total
        ? ((last.total - data.startBalance.total) / Math.abs(data.startBalance.total)) * 100
        : 0,
      min,
      max,
      minDate,
      maxDate,
      first,
      last,
    };
  }, [data]);

  function applyPreset(id: string) {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    if (id === "all") {
      setFrom("");
    } else {
      setFrom(p.offset());
    }
    setTo(todayIso());
  }

  return (
    <div className="card-soft p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <TrendingUp className="size-4 text-blue-700" />
          Vermögensentwicklung
          <span className="text-xs font-normal text-slate-500">
            Tagesgenauer Saldo · Hauptkonto + Global Grant
          </span>
        </h3>
        {busy && (
          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" /> lade …
          </span>
        )}
      </div>

      {/* Range-Steuerung */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                preset === p.id
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Calendar className="size-3.5 text-slate-500" />
          <label className="text-xs text-slate-600">Von:</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className="input text-xs px-2 py-1 w-[140px]"
            max={to || undefined}
          />
          <label className="text-xs text-slate-600 ml-1">Bis:</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className="input text-xs px-2 py-1 w-[140px]"
            min={from || undefined}
            max={todayIso()}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm p-2 mb-3 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* KPI-Zeile */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Kpi
            label="Aktuelles Vermögen"
            value={formatEUR(stats.currentTotal)}
            sub={`am ${formatDate(stats.last.date)}`}
            accent="blue"
          />
          <Kpi
            label={`Veränderung seit ${formatDate(stats.first.date)}`}
            value={`${stats.changeAbs >= 0 ? "+" : ""}${formatEUR(stats.changeAbs)}`}
            sub={`${stats.changeAbs >= 0 ? "+" : ""}${stats.changePct.toFixed(1)} %`}
            accent={stats.changeAbs >= 0 ? "green" : "red"}
          />
          <Kpi
            label="Höchststand"
            value={formatEUR(stats.max)}
            sub={`am ${formatDate(stats.maxDate)}`}
            accent="green"
          />
          <Kpi
            label="Tiefststand"
            value={formatEUR(stats.min)}
            sub={`am ${formatDate(stats.minDate)}`}
            accent="amber"
          />
        </div>
      )}

      {/* Chart */}
      <div style={{ minHeight: 320 }}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart
            data={data?.series ?? []}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <defs>
              <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#17458F" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#17458F" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={tickDate}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={(v) => formatEUR(Number(v)).replace(/\s?€/, " €")}
              width={90}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
              iconType="line"
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Gesamtvermögen"
              stroke="#17458F"
              strokeWidth={2.5}
              fill="url(#totalGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="main"
              name="Hauptkonto"
              stroke="#0099CC"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
            />
            <Line
              type="monotone"
              dataKey="gg"
              name="Global Grant"
              stroke="#F7A81B"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "blue" | "green" | "red" | "amber";
}) {
  const colors: Record<typeof accent, string> = {
    blue: "#17458F",
    green: "#047857",
    red: "#B91C1C",
    amber: "#D45F00",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div
        className="font-bold text-base sm:text-lg tabular"
        style={{ color: colors[accent] }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Point }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-white shadow-lg rounded-md border border-slate-200 p-2.5 text-xs">
      <div className="font-semibold text-slate-700 mb-1">
        {formatDate(p.date)}
      </div>
      <div className="space-y-0.5">
        <Row color="#17458F" label="Gesamtvermögen" value={p.total} bold />
        <Row color="#0099CC" label="Hauptkonto" value={p.main} />
        <Row color="#F7A81B" label="Global Grant" value={p.gg} />
        {p.delta !== 0 && (
          <Row
            color={p.delta >= 0 ? "#047857" : "#B91C1C"}
            label="Tagesveränderung"
            value={p.delta}
            sign
          />
        )}
      </div>
    </div>
  );
}

function Row({
  color,
  label,
  value,
  bold,
  sign,
}: {
  color: string;
  label: string;
  value: number;
  bold?: boolean;
  sign?: boolean;
}) {
  const text = `${sign && value >= 0 ? "+" : ""}${formatEUR(value)}`;
  return (
    <div className="flex items-center gap-2 justify-between min-w-[180px]">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: color }}
        />
        <span className="text-slate-600">{label}</span>
      </div>
      <span
        className={`tabular ${bold ? "font-bold" : ""}`}
        style={{ color: bold ? color : undefined }}
      >
        {text}
      </span>
    </div>
  );
}

function tickDate(iso: string) {
  // YYYY-MM-DD → "DD.MM.YY"
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}
function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}