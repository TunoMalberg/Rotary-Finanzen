"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";

const COLORS = [
  "#7B2D8E", // purple
  "#17458F", // rotary blue
  "#F7A81B", // gold
  "#00A28A", // teal
  "#D45F00", // orange
  "#047857", // emerald
  "#B91C1C", // rose
  "#0099CC", // sky
];

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Plus className="size-4" /> Neues Projekt
      </button>
      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    color: COLORS[0],
    startDate: "",
    endDate: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Neues Projekt"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Neues Projekt anlegen</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Schließen">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Code *</label>
              <input
                className="input font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="RYLA26"
                maxLength={20}
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">Kurzcode, eindeutig.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Name *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="RYLA 2026"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Beschreibung</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Kurzbeschreibung (optional)"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`size-8 rounded-full transition ring-offset-2 ${form.color === c ? "ring-2 ring-slate-900" : ""}`}
                  style={{ background: c }}
                  aria-label={`Farbe ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Beginn</label>
              <input
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Ende</label>
              <input
                type="date"
                className="input"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Anlegen
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Abbrechen</button>
          </div>
        </form>
      </div>
    </div>
  );
}

