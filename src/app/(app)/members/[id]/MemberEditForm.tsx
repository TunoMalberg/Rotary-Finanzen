"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, Loader2 } from "lucide-react";

export function MemberEditForm({ member }: { member: {
  id: string;
  lastName: string; firstName: string;
  email: string | null; phone: string | null; address: string | null; city: string | null;
  postalCode: string | null; country: string | null;
  paysBySEPA: boolean; isExempt: boolean; duesAmount: number; status: string; notes: string | null;
} }) {
  const router = useRouter();
  const [form, setForm] = useState(member);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, duesAmount: Number(form.duesAmount) }),
    });
    setSaving(false);
    router.refresh();
  }
  return (
    <form onSubmit={save} className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nachname"><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Vorname"><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="E-Mail"><input className="input" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Telefon"><input className="input" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Adresse" className="col-span-2"><input className="input" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="PLZ"><input className="input" value={form.postalCode ?? ""} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
        <Field label="Stadt"><input className="input" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Beitrag (EUR)"><input className="input font-mono" type="number" value={form.duesAmount} onChange={(e) => setForm({ ...form, duesAmount: Number(e.target.value) })} /></Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ACTIVE">Aktiv</option>
            <option value="INACTIVE">Inaktiv</option>
            <option value="EXEMPT">Befreit</option>
          </select>
        </Field>
        <div className="flex flex-col gap-2 mt-5">
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.paysBySEPA} onChange={(e) => setForm({ ...form, paysBySEPA: e.target.checked })} /> Einzugsermächtigung</label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.isExempt} onChange={(e) => setForm({ ...form, isExempt: e.target.checked })} /> Beitragsbefreit</label>
        </div>
      </div>
      <Field label="Notizen"><textarea className="input" rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <button className="btn-primary" disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Speichern
      </button>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-slate-700 mb-1 block">{label}</label>
      {children}
    </div>
  );
}