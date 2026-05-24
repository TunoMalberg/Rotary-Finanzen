"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";

export function NewAttendanceForm({ clubYearId, clubYearLabel, members }: { clubYearId: string; clubYearLabel: string; members: { id: string; name: string; sepa: boolean }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    eventName: "",
    eventDate: new Date().toISOString().slice(0, 10),
    billPerHead: "",
    paymentMethod: "MIXED" as "SEPA" | "EMAIL_INVOICE" | "MIXED",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clubYearId,
        eventName: form.eventName,
        eventDate: form.eventDate,
        billPerHead: Number(form.billPerHead.replace(",", ".")),
        paymentMethod: form.paymentMethod,
        memberIds: selected,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/attendance/${data.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="card-soft p-5 space-y-3">
        <p className="text-xs text-slate-500">Clubjahr <strong>{clubYearLabel}</strong></p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block">Veranstaltung</label>
            <input className="input" required value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} placeholder="z.B. Madrid-Reise, Heuriger" />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Datum</label>
            <input type="date" className="input" required value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Beitrag pro Teilnehmer (EUR)</label>
            <input className="input font-mono" required value={form.billPerHead} onChange={(e) => setForm({ ...form, billPerHead: e.target.value })} placeholder="z.B. 120" />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Methode</label>
            <select className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as "SEPA" | "EMAIL_INVOICE" | "MIXED" })}>
              <option value="MIXED">Mix (SEPA bei EZ-Mitgliedern, sonst Rechnung)</option>
              <option value="SEPA">Nur Einzug</option>
              <option value="EMAIL_INVOICE">Nur Rechnung</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card-soft p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Teilnehmer ({selected.length} ausgewählt)</h3>
          <div className="flex gap-2 text-sm">
            <button type="button" className="btn-ghost text-xs" onClick={() => setSelected(members.map((m) => m.id))}>Alle</button>
            <button type="button" className="btn-ghost text-xs" onClick={() => setSelected([])}>Keine</button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-1 max-h-96 overflow-auto pr-2">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-slate-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((id) => id !== m.id))}
              />
              <span>{m.name}</span>
              {m.sepa && <span className="chip chip-sepa text-[10px] py-0">EZ</span>}
            </label>
          ))}
        </div>
      </div>

      <button className="btn-primary" disabled={saving || selected.length === 0}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Liste anlegen ({selected.length} Teilnehmer)
      </button>
    </form>
  );
}