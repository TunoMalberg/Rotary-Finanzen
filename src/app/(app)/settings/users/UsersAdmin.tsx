"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2, KeyRound, Check, X } from "lucide-react";

type U = { id: string; email: string; name: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  president: "Präsident (Read-only)",
  treasurer: "Schatzmeister (Vollzugriff)",
  auditor: "Rechnungsprüfer (Vollzugriff inkl. Belege)",
  admin: "Admin",
};

export function UsersAdmin({ users: initial }: { users: U[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [form, setForm] = useState({ email: "", name: "", role: "president", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // per-row password reset
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) {
      const u = await res.json();
      setUsers([...users, u]);
      setForm({ email: "", name: "", role: "president", password: "" });
      setOk(`Benutzer „${u.email}" angelegt.`);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Benutzer konnte nicht angelegt werden.");
    }
  }

  async function del(id: string) {
    if (!confirm("Benutzer löschen?")) return;
    setError(null);
    setOk(null);
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers(users.filter((u) => u.id !== id));
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Benutzer konnte nicht gelöscht werden.");
    }
  }

  async function changeRole(id: string, role: string) {
    setError(null);
    setOk(null);
    setRowBusy(id);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setRowBusy(null);
    if (res.ok) {
      setUsers(users.map((u) => (u.id === id ? { ...u, role } : u)));
      setOk("Rolle aktualisiert.");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Rolle konnte nicht geändert werden.");
    }
  }

  async function saveReset(id: string) {
    if (resetPw.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setError(null);
    setOk(null);
    setRowBusy(id);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPw }),
    });
    setRowBusy(null);
    if (res.ok) {
      setResetId(null);
      setResetPw("");
      setOk("Passwort zurückgesetzt.");
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Passwort konnte nicht zurückgesetzt werden.");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card-soft p-3 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className="input" placeholder="Name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="president">Präsident (Read-only)</option>
          <option value="treasurer">Schatzmeister (Vollzugriff)</option>
          <option value="auditor">Rechnungsprüfer (Vollzugriff inkl. Belege)</option>
          <option value="admin">Admin</option>
        </select>
        <input className="input" type="password" autoComplete="new-password" placeholder="Initial-Passwort (min. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        <div className="sm:col-span-2 flex flex-col gap-2">
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Benutzer anlegen</button>
          {error && <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-2.5">{error}</div>}
          {ok && <div className="rounded-md bg-green-50 border border-green-200 text-green-700 text-sm p-2.5">{ok}</div>}
        </div>
      </form>

      <div className="card-soft overflow-hidden">
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th className="text-right">Aktion</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name" className="font-medium">{u.name}</td>
                    <td data-label="E-Mail" className="font-mono text-sm break-all">{u.email}</td>
                    <td data-label="Rolle">
                      <select
                        className="input py-1 text-sm"
                        value={u.role}
                        disabled={rowBusy === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        aria-label={`Rolle von ${u.name}`}
                      >
                        {Object.entries(ROLE_LABEL).map(([v, label]) => (
                          <option key={v} value={v}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Aktion" className="text-right">
                      {resetId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            className="input py-1 text-sm w-40"
                            type="text"
                            autoComplete="new-password"
                            placeholder="Neues Passwort (min. 8)"
                            value={resetPw}
                            onChange={(e) => setResetPw(e.target.value)}
                          />
                          <button onClick={() => saveReset(u.id)} disabled={rowBusy === u.id} aria-label="Passwort speichern" className="btn-primary text-xs">
                            {rowBusy === u.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          </button>
                          <button onClick={() => { setResetId(null); setResetPw(""); }} aria-label="Abbrechen" className="btn-ghost text-xs"><X className="size-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setResetId(u.id); setResetPw(""); setError(null); setOk(null); }} aria-label="Passwort zurücksetzen" className="btn-ghost text-xs" title="Passwort zurücksetzen"><KeyRound className="size-3.5" /></button>
                          <button onClick={() => del(u.id)} aria-label="Benutzer löschen" className="btn-danger text-xs"><Trash2 className="size-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}