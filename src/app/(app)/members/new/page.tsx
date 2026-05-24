"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, Loader2 } from "lucide-react";

export default function NewMemberPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    rotaryMemberId: "",
    lastName: "", firstName: "",
    email: "", phone: "",
    address: "", postalCode: "", city: "", country: "Austria",
    paysBySEPA: false, isExempt: false, duesAmount: 580, status: "ACTIVE",
  });
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { router.push("/members"); router.refresh(); }
  }
  return (
    <div className="max-w-2xl fade-up">
      <h1 className="text-2xl font-bold mb-6">Neues Mitglied</h1>
      <form onSubmit={save} className="card-soft p-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nachname"><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></Field>
          <Field label="Vorname"><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></Field>
          <Field label="Rotary-ID"><input className="input" value={form.rotaryMemberId} onChange={(e) => setForm({ ...form, rotaryMemberId: e.target.value })} /></Field>
          <Field label="Beitrag (EUR)"><input className="input" type="number" value={form.duesAmount} onChange={(e) => setForm({ ...form, duesAmount: Number(e.target.value) })} /></Field>
          <Field label="E-Mail"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Telefon"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Adresse" className="col-span-2"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="PLZ"><input className="input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
          <Field label="Stadt"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        </div>
        <div className="flex gap-6 pt-2">
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.paysBySEPA} onChange={(e) => setForm({ ...form, paysBySEPA: e.target.checked })} /> Einzugsermächtigung</label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.isExempt} onChange={(e) => setForm({ ...form, isExempt: e.target.checked })} /> Beitragsbefreit</label>
        </div>
        <button className="btn-primary" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Anlegen</button>
      </form>
    </div>
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