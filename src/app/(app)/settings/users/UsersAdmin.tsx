"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2 } from "lucide-react";

type U = { id: string; email: string; name: string; role: string };

export function UsersAdmin({ users: initial }: { users: U[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [form, setForm] = useState({ email: "", name: "", role: "president", password: "" });
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
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
      router.refresh();
    }
  }
  async function del(id: string) {
    if (!confirm("Benutzer löschen?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    setUsers(users.filter((u) => u.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card-soft p-3 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className="input" placeholder="Name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="president">Präsident (Read-only)</option>
          <option value="treasurer">Schatzmeister (Vollzugriff)</option>
          <option value="admin">Admin</option>
        </select>
        <input className="input" type="password" autoComplete="new-password" placeholder="Initial-Passwort (min. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        <div className="sm:col-span-2">
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Benutzer anlegen</button>
        </div>
      </form>

      <div className="card-soft overflow-hidden">
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th><span className="sr-only">Aktion</span></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name" className="font-medium">{u.name}</td>
                    <td data-label="E-Mail" className="font-mono text-sm break-all">{u.email}</td>
                    <td data-label="Rolle"><span className={`chip ${u.role === "treasurer" ? "chip-active" : u.role === "president" ? "chip-sepa" : "chip-cancelled"}`}>{u.role}</span></td>
                    <td data-label="Aktion" className="text-right"><button onClick={() => del(u.id)} aria-label="Benutzer löschen" className="btn-danger text-xs"><Trash2 className="size-3.5" /></button></td>
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