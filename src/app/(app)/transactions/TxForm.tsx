"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";

export function TxForm({
  clubYears,
  accounts,
  categories,
  members,
  defaultClubYearId,
  defaultAccountId,
  initial,
}: {
  clubYears: { id: string; label: string }[];
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; name: string; kind: string }[];
  members: { id: string; name: string }[];
  defaultClubYearId?: string;
  defaultAccountId?: string;
  initial?: {
    id: string;
    clubYearId: string;
    accountId: string;
    date: string;
    counterparty?: string | null;
    purpose?: string | null;
    note?: string | null;
    amount: number;
    categoryId?: string | null;
    memberId?: string | null;
    attachmentId?: string | null;
  };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clubYearId: initial?.clubYearId ?? defaultClubYearId ?? clubYears[0]?.id,
    accountId: initial?.accountId ?? defaultAccountId ?? accounts[0]?.id,
    date: initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    counterparty: initial?.counterparty ?? "",
    purpose: initial?.purpose ?? "",
    note: initial?.note ?? "",
    amount: initial?.amount?.toString() ?? "",
    categoryId: initial?.categoryId ?? "",
    memberId: initial?.memberId ?? "",
    attachmentId: initial?.attachmentId ?? "",
  });
  const [attachmentName, setAttachmentName] = useState<string | null>(null);

  async function uploadAttachment(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "INVOICE");
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    if (!res.ok) {
      setError("Upload fehlgeschlagen");
      return;
    }
    const data = await res.json();
    setForm((f) => ({ ...f, attachmentId: data.id }));
    setAttachmentName(data.fileName);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = initial?.id ? `/api/transactions/${initial.id}` : "/api/transactions";
    const method = initial?.id ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount.replace(",", ".")) }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Speichern fehlgeschlagen.");
      return;
    }
    router.push("/transactions");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card-soft p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Datum</label>
          <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Konto</label>
          <select className="input" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.type === "MAIN" ? "Haupt" : "GG"})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Clubjahr</label>
          <select className="input" value={form.clubYearId} onChange={(e) => setForm({ ...form, clubYearId: e.target.value })}>
            {clubYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Betrag (EUR)</label>
          <input
            type="text"
            className="input font-mono"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="z. B. 580 oder -250.50"
            required
          />
          <p className="text-xs text-slate-500 mt-1">Positiv = Einnahme, negativ = Ausgabe</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">Gegenpartei</label>
        <input className="input" value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">Verwendungszweck</label>
        <input className="input" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Kategorie</label>
          <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— ohne —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind === "INCOME" ? "Einnahme" : "Ausgabe"})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Mitglied (optional)</label>
          <select className="input" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
            <option value="">— keines —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">Notiz</label>
        <textarea className="input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">Beleg / Eingangsrechnung (PDF / E-Mail / Bild)</label>
        <input
          type="file"
          className="input"
          accept=".pdf,.eml,.png,.jpg,.jpeg,.msg,.txt"
          onChange={(e) => e.target.files?.[0] && uploadAttachment(e.target.files[0])}
        />
        {attachmentName && (
          <p className="text-xs text-emerald-700 mt-1">Hochgeladen: {attachmentName}</p>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {initial?.id ? "Aktualisieren" : "Speichern"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost">Abbrechen</button>
      </div>
    </form>
  );
}