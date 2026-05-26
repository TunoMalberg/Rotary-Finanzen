"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Plus, Trash2, UserPlus } from "lucide-react";

type MemberOption = { id: string; name: string; sepa: boolean; isGuest: boolean };

type SelectedMember = { memberId: string; personCount: number };

type NewNonMember = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  iban: string;
  paysBySEPA: boolean;
  personCount: number;
};

const emptyNonMember = (): NewNonMember => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  iban: "",
  paysBySEPA: false,
  personCount: 1,
});

export function NewAttendanceForm({
  clubYearId,
  clubYearLabel,
  members,
}: {
  clubYearId: string;
  clubYearLabel: string;
  members: MemberOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    eventName: "",
    eventDate: new Date().toISOString().slice(0, 10),
    description: "",
    billPerHead: "",
    paymentMethod: "MIXED" as "SEPA" | "EMAIL_INVOICE" | "MIXED",
  });
  const [selected, setSelected] = useState<Record<string, SelectedMember>>({});
  const [nonMembers, setNonMembers] = useState<NewNonMember[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, search]);

  const selectedCount = Object.values(selected).reduce((s, m) => s + m.personCount, 0);
  const nonMemberPersonCount = nonMembers.reduce((s, n) => s + (Number(n.personCount) || 0), 0);
  const totalPersons = selectedCount + nonMemberPersonCount;
  const billPerHeadNum = Number(form.billPerHead.replace(",", ".")) || 0;
  const totalAmount = totalPersons * billPerHeadNum;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[id] = { memberId: id, personCount: prev[id]?.personCount || 1 };
      else delete next[id];
      return next;
    });
  }
  function setCount(id: string, count: number) {
    setSelected((prev) => ({ ...prev, [id]: { memberId: id, personCount: Math.max(1, Math.floor(count) || 1) } }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.eventName.trim()) return setError("Eventname erforderlich");
    if (!billPerHeadNum || billPerHeadNum <= 0) return setError("Beitrag pro Person muss > 0 sein");
    if (totalPersons === 0) return setError("Mindestens 1 Teilnehmer auswählen");

    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubYearId,
          eventName: form.eventName,
          eventDate: form.eventDate,
          description: form.description,
          billPerHead: billPerHeadNum,
          paymentMethod: form.paymentMethod,
          members: Object.values(selected),
          newNonMembers: nonMembers
            .filter((n) => n.firstName.trim() && n.lastName.trim())
            .map((n) => ({
              firstName: n.firstName.trim(),
              lastName: n.lastName.trim(),
              email: n.email.trim() || null,
              phone: n.phone.trim() || null,
              iban: n.iban.trim() || null,
              paysBySEPA: n.paysBySEPA,
              personCount: n.personCount,
            })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Fehler ${res.status}`);
      }
      const data = await res.json();
      router.push(`/attendance/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="card-soft p-3 sm:p-5 space-y-3">
        <p className="text-xs text-slate-500">
          Clubjahr <strong>{clubYearLabel}</strong>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold mb-1 block">Veranstaltung</label>
            <input
              className="input"
              required
              value={form.eventName}
              onChange={(e) => setForm({ ...form, eventName: e.target.value })}
              placeholder="z. B. Madrid-Reise, Heuriger, Operngala"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold mb-1 block">Beschreibung (optional)</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="z. B. Bus + Hotel + Eintritt"
            />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Datum</label>
            <input
              type="date"
              className="input"
              required
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Beitrag pro Person (EUR)</label>
            <input
              className="input font-mono"
              inputMode="decimal"
              required
              value={form.billPerHead}
              onChange={(e) => setForm({ ...form, billPerHead: e.target.value })}
              placeholder="z. B. 120"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold mb-1 block">Methode</label>
            <select
              className="input"
              value={form.paymentMethod}
              onChange={(e) =>
                setForm({ ...form, paymentMethod: e.target.value as "SEPA" | "EMAIL_INVOICE" | "MIXED" })
              }
            >
              <option value="MIXED">Mix (SEPA bei EZ-Mitgliedern, sonst E-Mail-Rechnung)</option>
              <option value="SEPA">Nur Einzug (alle EZ)</option>
              <option value="EMAIL_INVOICE">Nur E-Mail-Rechnung</option>
            </select>
          </div>
        </div>
        {totalPersons > 0 && (
          <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-sm">
            {totalPersons} Personen × {billPerHeadNum.toFixed(2).replace(".", ",")} EUR ={" "}
            <strong>
              {totalAmount.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}
            </strong>
          </div>
        )}
      </div>

      <div className="card-soft p-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold">Mitglieder ({Object.keys(selected).length} ausgewählt, {selectedCount} Personen)</h3>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className="btn-ghost text-xs px-3"
              style={{ minHeight: 36 }}
              onClick={() => {
                const all: Record<string, SelectedMember> = {};
                for (const m of filteredMembers) all[m.id] = { memberId: m.id, personCount: 1 };
                setSelected(all);
              }}
            >
              Alle
            </button>
            <button
              type="button"
              className="btn-ghost text-xs px-3"
              style={{ minHeight: 36 }}
              onClick={() => setSelected({})}
            >
              Keine
            </button>
          </div>
        </div>
        <input
          className="input mb-3"
          placeholder="Mitglied suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[60vh] sm:max-h-96 overflow-auto -mx-1 pr-1">
          {filteredMembers.map((m) => {
            const sel = selected[m.id];
            return (
              <div key={m.id} className="flex items-center gap-2 text-sm py-2 px-2 hover:bg-slate-50 rounded min-h-[40px]">
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={!!sel}
                  onChange={(e) => toggle(m.id, e.target.checked)}
                />
                <span className="truncate flex-1">{m.name}</span>
                {m.isGuest && <span className="chip text-[10px] py-0 bg-purple-100 text-purple-800">Gast</span>}
                {m.sepa && <span className="chip chip-sepa text-[10px] py-0 shrink-0">EZ</span>}
                {sel && (
                  <input
                    type="number"
                    min={1}
                    className="input w-16 px-2 py-1 text-right font-mono text-sm shrink-0"
                    style={{ minHeight: 36 }}
                    value={sel.personCount}
                    onChange={(e) => setCount(m.id, Number(e.target.value))}
                    title="Anzahl Personen"
                  />
                )}
              </div>
            );
          })}
          {filteredMembers.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-6 sm:col-span-2">Keine Treffer.</div>
          )}
        </div>
      </div>

      <div className="card-soft p-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold">Nichtmitglieder ({nonMembers.length})</h3>
          <button
            type="button"
            className="btn-ghost text-xs px-3"
            style={{ minHeight: 36 }}
            onClick={() => setNonMembers([...nonMembers, emptyNonMember()])}
          >
            <UserPlus className="size-4" /> Hinzufügen
          </button>
        </div>
        {nonMembers.length === 0 ? (
          <p className="text-sm text-slate-500">
            Gäste oder externe Teilnehmer können hier angelegt werden. Sie werden in der Mitgliederdatei mit
            Status <span className="chip text-[10px] py-0 bg-purple-100 text-purple-800">Gast</span> gespeichert
            und können später zu Mitgliedern werden.
          </p>
        ) : (
          <div className="space-y-3">
            {nonMembers.map((nm, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  className="input sm:col-span-3"
                  placeholder="Vorname *"
                  value={nm.firstName}
                  onChange={(e) =>
                    setNonMembers(nonMembers.map((x, j) => (i === j ? { ...x, firstName: e.target.value } : x)))
                  }
                />
                <input
                  className="input sm:col-span-3"
                  placeholder="Nachname *"
                  value={nm.lastName}
                  onChange={(e) =>
                    setNonMembers(nonMembers.map((x, j) => (i === j ? { ...x, lastName: e.target.value } : x)))
                  }
                />
                <input
                  className="input sm:col-span-3"
                  type="email"
                  placeholder="E-Mail (für Rechnung)"
                  value={nm.email}
                  onChange={(e) =>
                    setNonMembers(nonMembers.map((x, j) => (i === j ? { ...x, email: e.target.value } : x)))
                  }
                />
                <input
                  type="number"
                  min={1}
                  className="input sm:col-span-2 font-mono text-right"
                  placeholder="Pers."
                  value={nm.personCount}
                  onChange={(e) =>
                    setNonMembers(
                      nonMembers.map((x, j) =>
                        i === j ? { ...x, personCount: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="btn-ghost sm:col-span-1 text-red-600"
                  style={{ minHeight: 40 }}
                  onClick={() => setNonMembers(nonMembers.filter((_, j) => j !== i))}
                  title="Entfernen"
                >
                  <Trash2 className="size-4" />
                </button>
                <input
                  className="input sm:col-span-3"
                  placeholder="Telefon"
                  value={nm.phone}
                  onChange={(e) =>
                    setNonMembers(nonMembers.map((x, j) => (i === j ? { ...x, phone: e.target.value } : x)))
                  }
                />
                <input
                  className="input sm:col-span-5 font-mono"
                  placeholder="IBAN (optional, falls EZ)"
                  value={nm.iban}
                  onChange={(e) =>
                    setNonMembers(nonMembers.map((x, j) => (i === j ? { ...x, iban: e.target.value } : x)))
                  }
                />
                <label className="flex items-center gap-2 text-sm sm:col-span-4 px-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={nm.paysBySEPA}
                    onChange={(e) =>
                      setNonMembers(
                        nonMembers.map((x, j) => (i === j ? { ...x, paysBySEPA: e.target.checked } : x)),
                      )
                    }
                  />
                  Einzugsermächtigung erteilt
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">{error}</div>
      )}

      <button className="btn-primary w-full sm:w-auto" disabled={saving || totalPersons === 0}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Liste anlegen ({totalPersons}{" "}
        {totalPersons === 1 ? "Person" : "Personen"})
      </button>
    </form>
  );
}