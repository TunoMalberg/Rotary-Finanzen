"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { formatDate, formatEUR } from "@/lib/format";

type Entry = { id: string; date: string; label: string; amount: number; isPlanned: boolean };

export function CashflowView({ clubYearId, entries: initial, startBalance, canEdit }: { clubYearId: string; entries: Entry[]; startBalance: number; canEdit: boolean }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), label: "", amount: "" });

  const series = useMemo(() => {
    let bal = startBalance;
    const series = [{ date: "Heute", balance: bal, label: "" }];
    for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
      bal += e.amount;
      series.push({
        date: new Date(e.date).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" }),
        balance: bal,
        label: e.label,
      });
    }
    return series;
  }, [entries, startBalance]);

  async function add() {
    if (!form.label || !form.amount) return;
    setBusy(true);
    const res = await fetch("/api/cashflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubYearId, date: form.date, label: form.label, amount: Number(form.amount.replace(",", ".")), isPlanned: true }),
    });
    if (res.ok) {
      const d = await res.json();
      setEntries([...entries, { id: d.id, date: d.date, label: d.label, amount: d.amount, isPlanned: d.isPlanned }]);
      setForm({ date: form.date, label: "", amount: "" });
    }
    setBusy(false);
    router.refresh();
  }

  async function del(id: string) {
    if (!confirm("Eintrag löschen?")) return;
    setBusy(true);
    await fetch(`/api/cashflow/${id}`, { method: "DELETE" });
    setEntries(entries.filter((e) => e.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-3 sm:p-5">
        <h3 className="font-semibold mb-3">Saldo-Prognose</h3>
        <ResponsiveContainer width="100%" height={260} minHeight={220}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="balgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#17458F" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#17458F" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v) => formatEUR(Number(v))}
              labelFormatter={(l, p) => `${l}${p?.[0]?.payload?.label ? " — " + p[0].payload.label : ""}`}
              contentStyle={{ borderRadius: 8 }}
            />
            <ReferenceLine y={0} stroke="#b91c1c" strokeDasharray="2 4" />
            <Area type="monotone" dataKey="balance" stroke="#17458F" strokeWidth={2.5} fill="url(#balgrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {canEdit && (
        <div className="card-soft p-3 sm:p-4">
          <h3 className="font-semibold mb-3">Geplanten Cashflow hinzufügen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Datum" />
            <input placeholder="Label, z.B. Distrikt-Beitrag" className="input sm:col-span-2" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <input inputMode="decimal" placeholder="Betrag (+/-)" className="input font-mono" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <button onClick={add} disabled={busy} className="btn-primary mt-3 w-full sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Hinzufügen
          </button>
        </div>
      )}

      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b font-semibold">Geplante Cashflows</div>
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Datum</th><th>Beschreibung</th><th>Status</th><th className="text-right">Betrag</th>{canEdit && <th><span className="sr-only">Aktionen</span></th>}</tr></thead>
              <tbody>
                {entries.sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
                  const overdue = e.isPlanned && new Date(e.date) < new Date();
                  return (
                    <tr key={e.id} className={overdue ? "danger" : ""}>
                      <td data-label="Datum" className="whitespace-nowrap">{formatDate(e.date)}</td>
                      <td data-label="Beschreibung">{e.label}</td>
                      <td data-label="Status">{overdue ? <span className="chip chip-reminded">Überfällig</span> : <span className="chip chip-open">Geplant</span>}</td>
                      <td data-label="Betrag" className={`text-right font-mono tabular ${e.amount >= 0 ? "amount-pos" : "amount-neg"}`}>{formatEUR(e.amount)}</td>
                      {canEdit && <td data-label="Aktion" className="text-right"><button onClick={() => del(e.id)} aria-label="Eintrag löschen" className="btn-danger text-xs px-2.5 py-1.5"><Trash2 className="size-3.5" /></button></td>}
                    </tr>
                  );
                })}
                {entries.length === 0 && <tr><td colSpan={canEdit ? 5 : 4} className="text-center text-slate-500 py-8 no-stack-label">Keine geplanten Cashflows.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}