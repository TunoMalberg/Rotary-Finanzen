"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Printer, Search, X, Check, Trash2, Save } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";

type TxRow = {
  id: string;
  date: string;
  counterparty: string | null;
  purpose: string | null;
  amount: number;
  account: { type: string };
  category: { name: string; color: string } | null;
  projectId: string | null;
  project: { code: string; color: string } | null;
};

const COLORS = ["#7B2D8E", "#17458F", "#F7A81B", "#00A28A", "#D45F00", "#047857", "#B91C1C", "#0099CC"];

export function PrintButton() {
  return (
    <button
      type="button"
      className="btn-ghost no-print"
      onClick={() => typeof window !== "undefined" && window.print()}
    >
      <Printer className="size-4" /> Drucken
    </button>
  );
}

export function EditButton({
  project,
}: {
  project: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    color: string;
    startDate: string;
    endDate: string;
    isClosed: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
        <Pencil className="size-4" /> Bearbeiten
      </button>
      {open && <EditDialog project={project} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditDialog({
  project,
  onClose,
}: {
  project: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    color: string;
    startDate: string;
    endDate: string;
    isClosed: boolean;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: project.code,
    name: project.name,
    description: project.description ?? "",
    color: project.color,
    startDate: project.startDate,
    endDate: project.endDate,
    isClosed: project.isClosed,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
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

  async function remove() {
    if (!confirm("Projekt wirklich löschen? Buchungen bleiben erhalten und werden nur entkoppelt.")) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setError("Löschen fehlgeschlagen.");
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Projekt bearbeiten</h3>
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
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Beschreibung</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                  className={`size-8 rounded-full ${form.color === c ? "ring-2 ring-offset-2 ring-slate-900" : ""}`}
                  style={{ background: c }}
                  aria-label={`Farbe ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Beginn</label>
              <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Ende</label>
              <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isClosed}
              onChange={(e) => setForm({ ...form, isClosed: e.target.checked })}
            />
            Projekt abgeschlossen
          </label>

          {error && (
            <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1 justify-between">
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Speichern
              </button>
              <button type="button" onClick={onClose} className="btn-ghost">Abbrechen</button>
            </div>
            <button
              type="button"
              onClick={remove}
              className="btn-ghost text-rose-700 hover:bg-rose-50"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Projekt löschen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AssignButton({
  projectId,
  projectName,
  compact,
}: {
  projectId: string;
  projectName: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "btn-ghost text-sm" : "btn-primary"}
      >
        <Plus className="size-4" /> Buchungen zuordnen
      </button>
      {open && (
        <AssignDialog projectId={projectId} projectName={projectName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function AssignDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"unassigned" | "all">("unassigned");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/transactions/list?limit=2000")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setRows(data);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "unassigned" && r.projectId && r.projectId !== projectId) return false;
      if (q) {
        const hay = `${r.counterparty ?? ""} ${r.purpose ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filter, projectId]);

  const total = useMemo(() => {
    let s = 0;
    for (const id of selected) {
      const r = rows.find((x) => x.id === id);
      if (r) s += r.amount;
    }
    return s;
  }, [selected, rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function assign() {
    if (selected.size === 0) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: Array.from(selected) }),
    });
    setSaving(false);
    if (!res.ok) {
      alert("Zuordnen fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  async function unassign() {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} Buchung(en) vom Projekt entfernen?`)) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: Array.from(selected), unassign: true }),
    });
    setSaving(false);
    if (!res.ok) {
      alert("Entfernen fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Buchungen zuordnen</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Projekt: <span className="font-medium text-slate-700">{projectName}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Schließen">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Suche Gegenpartei / Zweck"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as "all" | "unassigned")}>
            <option value="unassigned">Nicht zugeordnet + dieses Projekt</option>
            <option value="all">Alle Buchungen</option>
          </select>
          <div className="text-xs text-slate-500">
            {selected.size} ausgewählt · Summe: <span className="font-mono font-semibold">{formatEUR(total)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500">
              <Loader2 className="size-6 animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-500">Keine Buchungen gefunden.</div>
          ) : (
            <table className="data-table">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="w-8" />
                  <th>Datum</th>
                  <th>Gegenpartei</th>
                  <th>Zweck</th>
                  <th>Kategorie</th>
                  <th>Projekt</th>
                  <th className="text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSel = selected.has(r.id);
                  const isThis = r.projectId === projectId;
                  return (
                    <tr
                      key={r.id}
                      className={`cursor-pointer ${isSel ? "bg-blue-50" : ""}`}
                      onClick={() => toggle(r.id)}
                    >
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(r.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="font-medium">{r.counterparty ?? "—"}</td>
                      <td className="text-slate-600 max-w-[260px] truncate">{r.purpose ?? "—"}</td>
                      <td>
                        {r.category ? (
                          <span className="chip" style={{ background: `${r.category.color}1A`, color: r.category.color }}>
                            {r.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        {r.project ? (
                          <span
                            className={`chip font-mono text-[11px] ${isThis ? "ring-1 ring-emerald-500" : ""}`}
                            style={{ background: `${r.project.color}1A`, color: r.project.color }}
                          >
                            {r.project.code}
                            {isThis && <Check className="inline size-3 ml-0.5" />}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className={`text-right font-mono tabular ${r.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                        {formatEUR(r.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2 flex-wrap">
          <button type="button" onClick={onClose} className="btn-ghost">Schließen</button>
          <button type="button" onClick={unassign} className="btn-ghost text-rose-700 hover:bg-rose-50" disabled={saving || selected.size === 0}>
            <Trash2 className="size-4" /> Vom Projekt entfernen
          </button>
          <button type="button" onClick={assign} className="btn-primary" disabled={saving || selected.size === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {selected.size} zuordnen
          </button>
        </div>
      </div>
    </div>
  );
}

