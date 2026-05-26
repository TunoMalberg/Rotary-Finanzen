"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Mail,
  Check,
  Bell,
  UserPlus,
  Pencil,
  X,
  AlertTriangle,
} from "lucide-react";
import { formatDate, formatEUR } from "@/lib/format";

type Entry = {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  memberStatus: string;
  memberPaysBySEPA: boolean;
  personCount: number;
  amount: number;
  paymentOverride: string | null;
  invoice: {
    id: string;
    reference: string;
    status: string;
    paymentMethod: string;
    amount: number;
    dueDate: string;
    reminderLevel: number;
  } | null;
};

type ListData = {
  id: string;
  eventName: string;
  eventDate: string;
  description: string | null;
  billPerHead: number;
  paymentMethod: string;
  clubYearLabel: string;
  category: { id: string; name: string } | null;
  entries: Entry[];
};

export function AttendanceListEditor({
  list,
  editable,
  availableMembers,
  summary,
}: {
  list: ListData;
  editable: boolean;
  availableMembers: { id: string; name: string; sepa: boolean; isGuest: boolean }[];
  summary: { total: number; totalPaid: number; totalOpen: number; totalNoInv: number };
}) {
  const router = useRouter();
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState({
    eventName: list.eventName,
    eventDate: list.eventDate.slice(0, 10),
    description: list.description ?? "",
    billPerHead: String(list.billPerHead),
    paymentMethod: list.paymentMethod,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, opts: RequestInit = {}) {
    setError(null);
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? `Fehler ${res.status}`;
      setError(msg);
      throw new Error(msg);
    }
    return res.json().catch(() => ({}));
  }

  async function saveHeader() {
    try {
      await call(`/api/attendance/${list.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          eventName: headerForm.eventName,
          eventDate: headerForm.eventDate,
          description: headerForm.description,
          billPerHead: Number(headerForm.billPerHead.replace(",", ".")),
          paymentMethod: headerForm.paymentMethod,
        }),
      });
      setEditingHeader(false);
      startTransition(() => router.refresh());
    } catch {
      /* fehler im error-state */
    }
  }

  async function deleteList() {
    if (!confirm("Liste komplett löschen? Alle offenen Forderungen werden storniert.")) return;
    try {
      await call(`/api/attendance/${list.id}`, { method: "DELETE" });
      router.push("/attendance");
      router.refresh();
    } catch {
      /* */
    }
  }

  async function issueInvoices() {
    try {
      const res = await call(`/api/attendance/${list.id}/issue-invoices`, { method: "POST" });
      alert(`${res.created ?? 0} Forderungen erzeugt${res.reactivated ? `, ${res.reactivated} reaktiviert` : ""}.`);
      startTransition(() => router.refresh());
    } catch {
      /* */
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-600">
            Auslagenprojekt · {list.clubYearLabel}
          </div>
          {!editingHeader ? (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{list.eventName}</h1>
              {editable && (
                <button
                  onClick={() => setEditingHeader(true)}
                  className="btn-ghost text-xs px-2 py-1"
                  title="Bearbeiten"
                >
                  <Pencil className="size-3.5" /> Bearbeiten
                </button>
              )}
            </div>
          ) : (
            <input
              autoFocus
              className="input mt-1 text-2xl font-bold w-full max-w-md"
              value={headerForm.eventName}
              onChange={(e) => setHeaderForm({ ...headerForm, eventName: e.target.value })}
            />
          )}
          {!editingHeader ? (
            <p className="text-slate-500 text-sm mt-1">
              {formatDate(list.eventDate)} · {list.entries.length} Teilnehmer ·{" "}
              <span className="font-semibold tabular">{formatEUR(list.billPerHead)}</span> pro Person · Methode{" "}
              <span className="chip text-[10px] py-0">{labelMethod(list.paymentMethod)}</span>
              {list.category && (
                <>
                  {" · Kategorie "}
                  <Link href={`/categories/${list.category.id}`} className="hover:text-blue-700 underline">
                    {list.category.name}
                  </Link>
                </>
              )}
            </p>
          ) : null}
          {!editingHeader && list.description && (
            <p className="text-sm text-slate-600 mt-1">{list.description}</p>
          )}
        </div>
        {!editingHeader && editable && (
          <button
            onClick={deleteList}
            className="btn-ghost text-xs px-2 py-1 text-red-600"
            title="Liste löschen"
          >
            <Trash2 className="size-3.5" /> Liste löschen
          </button>
        )}
      </header>

      {editingHeader && (
        <div className="card-soft p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Datum">
              <input
                type="date"
                className="input"
                value={headerForm.eventDate}
                onChange={(e) => setHeaderForm({ ...headerForm, eventDate: e.target.value })}
              />
            </Field>
            <Field label="Beitrag pro Person (EUR)">
              <input
                className="input font-mono"
                inputMode="decimal"
                value={headerForm.billPerHead}
                onChange={(e) => setHeaderForm({ ...headerForm, billPerHead: e.target.value })}
              />
            </Field>
            <Field label="Beschreibung" className="sm:col-span-2">
              <input
                className="input"
                value={headerForm.description}
                onChange={(e) => setHeaderForm({ ...headerForm, description: e.target.value })}
                placeholder="z. B. Bus + Hotel + Eintritt"
              />
            </Field>
            <Field label="Methode" className="sm:col-span-2">
              <select
                className="input"
                value={headerForm.paymentMethod}
                onChange={(e) => setHeaderForm({ ...headerForm, paymentMethod: e.target.value })}
              >
                <option value="MIXED">Mix</option>
                <option value="SEPA">Nur Einzug</option>
                <option value="EMAIL_INVOICE">Nur Rechnung</option>
              </select>
            </Field>
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 flex gap-2 items-start">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>
              Bei Änderung von „Beitrag pro Person" werden alle <strong>offenen</strong> Forderungen automatisch neu
              berechnet. Bezahlte Forderungen bleiben unverändert.
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={saveHeader} disabled={pending} className="btn-primary">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Speichern
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingHeader(false);
                setHeaderForm({
                  eventName: list.eventName,
                  eventDate: list.eventDate.slice(0, 10),
                  description: list.description ?? "",
                  billPerHead: String(list.billPerHead),
                  paymentMethod: list.paymentMethod,
                });
              }}
              className="btn-ghost"
            >
              <X className="size-4" /> Abbrechen
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">{error}</div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <SummaryCard label="Bezahlt" value={formatEUR(summary.totalPaid)} className="amount-pos" />
        <SummaryCard label="Offen" value={formatEUR(summary.totalOpen)} className="amount-neg" />
        <SummaryCard label="Ohne Forderung" value={summary.totalNoInv.toString()} />
      </div>

      {editable && summary.totalNoInv > 0 && (
        <div>
          <button onClick={issueInvoices} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}{" "}
            Forderungen erzeugen ({summary.totalNoInv})
          </button>
        </div>
      )}

      <EntriesTable list={list} editable={editable} onError={setError} onChanged={() => router.refresh()} />

      {editable && <AddParticipant listId={list.id} availableMembers={availableMembers} />}
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
function SummaryCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="card-soft p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-xl font-bold mt-1 tabular ${className ?? ""}`}>{value}</div>
    </div>
  );
}
function labelMethod(m: string) {
  return m === "SEPA" ? "EZ" : m === "EMAIL_INVOICE" ? "Rechnung" : "Mix";
}

/* -------- Entries table -------- */

function EntriesTable({
  list,
  editable,
  onError,
  onChanged,
}: {
  list: ListData;
  editable: boolean;
  onError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  return (
    <div className="card-soft overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b font-semibold flex items-center gap-2">
        <UserPlus className="size-4" /> Teilnehmer
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="text-center">Pers.</th>
              <th className="text-right">Betrag</th>
              <th>Methode</th>
              <th>Status</th>
              <th>Referenz</th>
              <th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {list.entries.map((e) => (
              <EntryRow
                key={e.id}
                listId={list.id}
                entry={e}
                editable={editable}
                listEventName={list.eventName}
                listDescription={list.description}
                onError={onError}
                onChanged={onChanged}
              />
            ))}
            {list.entries.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8 no-stack-label">
                  Noch keine Teilnehmer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntryRow({
  listId,
  entry,
  editable,
  listEventName,
  listDescription,
  onError,
  onChanged,
}: {
  listId: string;
  entry: Entry;
  editable: boolean;
  listEventName: string;
  listDescription: string | null;
  onError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editPersons, setEditPersons] = useState(false);
  const [pc, setPc] = useState(entry.personCount);

  async function call(url: string, opts: RequestInit = {}) {
    onError(null);
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? `Fehler ${res.status}`;
      onError(msg);
      throw new Error(msg);
    }
    return res.json().catch(() => ({}));
  }

  async function savePersons() {
    if (pc === entry.personCount) {
      setEditPersons(false);
      return;
    }
    setBusy(true);
    try {
      await call(`/api/attendance/${listId}/entries/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ personCount: pc }),
      });
      setEditPersons(false);
      router.refresh();
      onChanged();
    } catch {
      setPc(entry.personCount);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry() {
    if (entry.invoice?.status === "PAID") return;
    if (!confirm(`${entry.memberName} aus Liste entfernen?`)) return;
    setBusy(true);
    try {
      await call(`/api/attendance/${listId}/entries/${entry.id}`, { method: "DELETE" });
      router.refresh();
      onChanged();
    } catch {
      /* */
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    if (!entry.invoice) return;
    setBusy(true);
    try {
      await call(`/api/invoices/${entry.invoice.id}/remind`, { method: "POST" });
      window.open(buildMailto({ entry, kind: "REMINDER", listEventName, listDescription }), "_blank");
      router.refresh();
    } catch {
      /* */
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    if (!entry.invoice) return;
    if (!confirm("Forderung als bezahlt markieren?")) return;
    setBusy(true);
    try {
      await call(`/api/invoices/${entry.invoice.id}/markPaid`, { method: "POST" });
      router.refresh();
    } catch {
      /* */
    } finally {
      setBusy(false);
    }
  }

  function sendClaimMail() {
    window.open(buildMailto({ entry, kind: "CLAIM", listEventName, listDescription }), "_blank");
  }

  const isGuest = entry.memberStatus === "NON_MEMBER";
  const isPaid = entry.invoice?.status === "PAID";
  const isCancelled = entry.invoice?.status === "CANCELLED";
  const showRemind = !!entry.invoice && !isPaid && !isCancelled && entry.invoice.paymentMethod === "EMAIL_INVOICE";
  const showClaim = !!entry.invoice && !isPaid && !isCancelled && entry.invoice.paymentMethod === "EMAIL_INVOICE";

  return (
    <tr>
      <td className="font-medium">
        <Link href={`/members/${entry.memberId}`} className="hover:text-blue-700">
          {entry.memberName}
        </Link>
        {isGuest && <span className="chip text-[10px] py-0 ml-1 bg-purple-100 text-purple-800">Gast</span>}
        {!entry.memberEmail && <span className="chip text-[10px] py-0 ml-1 bg-amber-100 text-amber-800">ohne E-Mail</span>}
      </td>
      <td className="text-center">
        {editable && !isPaid && editPersons ? (
          <div className="flex justify-center items-center gap-1">
            <input
              autoFocus
              type="number"
              min={1}
              className="input w-14 text-right font-mono px-2 py-1"
              style={{ minHeight: 32 }}
              value={pc}
              onChange={(e) => setPc(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") savePersons();
                if (e.key === "Escape") {
                  setEditPersons(false);
                  setPc(entry.personCount);
                }
              }}
            />
            <button onClick={savePersons} disabled={busy} className="btn-ghost text-xs px-1 py-1">
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            </button>
          </div>
        ) : (
          <button
            disabled={!editable || isPaid}
            onClick={() => setEditPersons(true)}
            className={`tabular ${editable && !isPaid ? "hover:bg-slate-100 rounded px-2 py-1" : ""}`}
            title={editable && !isPaid ? "Personenzahl ändern" : undefined}
          >
            {entry.personCount}
          </button>
        )}
      </td>
      <td className="text-right font-mono tabular">{formatEUR(entry.amount)}</td>
      <td>
        {entry.invoice ? (
          <span className={`chip ${entry.invoice.paymentMethod === "SEPA" ? "chip-sepa" : "chip-invoice"}`}>
            {entry.invoice.paymentMethod === "SEPA" ? "EZ" : "Rechnung"}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td>
        {entry.invoice ? (
          <span className={`chip chip-${entry.invoice.status.toLowerCase()}`}>
            {statusDe(entry.invoice.status)}
            {entry.invoice.reminderLevel > 0 && entry.invoice.status !== "PAID" && (
              <span className="ml-1 text-[10px]">·M{entry.invoice.reminderLevel}</span>
            )}
          </span>
        ) : (
          <span className="chip chip-cancelled">Ohne Rg.</span>
        )}
      </td>
      <td className="font-mono text-xs">{entry.invoice?.reference ?? "—"}</td>
      <td className="text-right">
        <div className="flex justify-end gap-1 flex-wrap">
          {showClaim && (
            <button
              type="button"
              onClick={sendClaimMail}
              className="btn-ghost text-xs px-2 py-1"
              title="Forderung per E-Mail senden"
              disabled={busy}
            >
              <Mail className="size-3.5" /> Mail
            </button>
          )}
          {showRemind && (
            <button
              type="button"
              onClick={remind}
              disabled={busy}
              className="btn-ghost text-xs px-2 py-1"
              title="Mahnen"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />} Mahnen
            </button>
          )}
          {entry.invoice && !isPaid && !isCancelled && editable && (
            <button
              type="button"
              onClick={markPaid}
              disabled={busy}
              className="btn-ghost text-xs px-2 py-1"
              title="Als bezahlt markieren"
            >
              <Check className="size-3.5" /> Bezahlt
            </button>
          )}
          {editable && !isPaid && (
            <button
              type="button"
              onClick={deleteEntry}
              disabled={busy}
              className="btn-ghost text-xs px-2 py-1 text-red-600"
              title="Teilnehmer entfernen"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
function statusDe(s: string) {
  return s === "OPEN"
    ? "Offen"
    : s === "PAID"
      ? "Bezahlt"
      : s === "REMINDED"
        ? "Gemahnt"
        : s === "CANCELLED"
          ? "Storno"
          : s;
}

function buildMailto({
  entry,
  kind,
  listEventName,
  listDescription,
}: {
  entry: Entry;
  kind: "CLAIM" | "REMINDER";
  listEventName: string;
  listDescription: string | null;
}) {
  const inv = entry.invoice;
  if (!inv) return "mailto:";
  const due = new Date(inv.dueDate).toLocaleDateString("de-AT");
  const subject =
    kind === "CLAIM"
      ? `Forderung ${listEventName} (${inv.reference})`
      : inv.reminderLevel >= 1
        ? `${inv.reminderLevel}. Mahnung – ${listEventName} (${inv.reference})`
        : `Erinnerung – ${listEventName} (${inv.reference})`;
  const desc = listDescription ? `\nDetails: ${listDescription}\n` : "";
  const body =
    `Lieber Freund/liebe Freundin ${entry.memberName.split(",")[1]?.trim() ?? entry.memberName},\n\n` +
    `für Ihre Teilnahme an "${listEventName}" haben wir vorab die Kosten beglichen und bitten um Erstattung:\n\n` +
    `Betrag: ${formatEUR(inv.amount)} (${entry.personCount} ${entry.personCount === 1 ? "Person" : "Personen"})\n` +
    `Verwendungszweck: ${inv.reference}\n` +
    `Fällig: ${due}\n` +
    desc +
    `\nÜberweisung an:\nIBAN AT41 2011 1310 0670 0296\nRotary Club Wien-Donau\n\n` +
    (kind === "REMINDER"
      ? `Falls die Zahlung in den letzten Tagen erfolgt ist, betrachten Sie diese Mail bitte als gegenstandslos.\n\n`
      : "") +
    `Mit besten rotarischen Grüßen,\nDer Schatzmeister\nRotary Club Wien-Donau`;
  return `mailto:${entry.memberEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* -------- Add participant -------- */

function AddParticipant({
  listId,
  availableMembers,
}: {
  listId: string;
  availableMembers: { id: string; name: string; sepa: boolean; isGuest: boolean }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "MEMBER" | "GUEST">(null);
  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [personCount, setPersonCount] = useState(1);
  const [guest, setGuest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    iban: "",
    paysBySEPA: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableMembers.slice(0, 50);
    return availableMembers.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 50);
  }, [availableMembers, search]);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      let body: object;
      if (mode === "MEMBER") {
        if (!memberId) {
          setError("Bitte Mitglied auswählen");
          setBusy(false);
          return;
        }
        body = { memberId, personCount };
      } else {
        if (!guest.firstName.trim() || !guest.lastName.trim()) {
          setError("Vor- und Nachname erforderlich");
          setBusy(false);
          return;
        }
        body = {
          newNonMember: {
            firstName: guest.firstName.trim(),
            lastName: guest.lastName.trim(),
            email: guest.email.trim() || null,
            phone: guest.phone.trim() || null,
            iban: guest.iban.trim() || null,
            paysBySEPA: guest.paysBySEPA,
            personCount,
          },
        };
      }
      const res = await fetch(`/api/attendance/${listId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Fehler ${res.status}`);
      }
      // reset
      setMode(null);
      setMemberId(null);
      setSearch("");
      setPersonCount(1);
      setGuest({ firstName: "", lastName: "", email: "", phone: "", iban: "", paysBySEPA: false });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  if (!mode) {
    return (
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setMode("MEMBER")} className="btn-ghost">
          <Plus className="size-4" /> Mitglied hinzufügen
        </button>
        <button onClick={() => setMode("GUEST")} className="btn-ghost">
          <UserPlus className="size-4" /> Gast / Nichtmitglied hinzufügen
        </button>
      </div>
    );
  }

  return (
    <div className="card-soft p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {mode === "MEMBER" ? "Mitglied hinzufügen" : "Gast / Nichtmitglied hinzufügen"}
        </h3>
        <button
          onClick={() => {
            setMode(null);
            setError(null);
          }}
          className="btn-ghost text-xs px-2 py-1"
        >
          <X className="size-4" /> Abbrechen
        </button>
      </div>
      {mode === "MEMBER" ? (
        <>
          <input
            className="input"
            placeholder="Mitglied suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-64 overflow-auto rounded border border-slate-200">
            {filtered.length === 0 ? (
              <div className="text-sm text-slate-500 p-3">Keine Treffer</div>
            ) : (
              filtered.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm border-b border-slate-100 last:border-0"
                >
                  <input
                    type="radio"
                    name="memberPick"
                    checked={memberId === m.id}
                    onChange={() => setMemberId(m.id)}
                  />
                  <span className="flex-1 truncate">{m.name}</span>
                  {m.isGuest && <span className="chip text-[10px] py-0 bg-purple-100 text-purple-800">Gast</span>}
                  {m.sepa && <span className="chip chip-sepa text-[10px] py-0">EZ</span>}
                </label>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Vorname *">
            <input
              className="input"
              value={guest.firstName}
              onChange={(e) => setGuest({ ...guest, firstName: e.target.value })}
            />
          </Field>
          <Field label="Nachname *">
            <input
              className="input"
              value={guest.lastName}
              onChange={(e) => setGuest({ ...guest, lastName: e.target.value })}
            />
          </Field>
          <Field label="E-Mail" className="sm:col-span-2">
            <input
              className="input"
              type="email"
              value={guest.email}
              onChange={(e) => setGuest({ ...guest, email: e.target.value })}
            />
          </Field>
          <Field label="Telefon">
            <input
              className="input"
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
            />
          </Field>
          <Field label="IBAN (für EZ)">
            <input
              className="input font-mono"
              value={guest.iban}
              onChange={(e) => setGuest({ ...guest, iban: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 px-1">
            <input
              type="checkbox"
              className="size-5"
              checked={guest.paysBySEPA}
              onChange={(e) => setGuest({ ...guest, paysBySEPA: e.target.checked })}
            />
            Einzugsermächtigung erteilt
          </label>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <Field label="Personenzahl">
          <input
            type="number"
            min={1}
            className="input w-24 text-right font-mono"
            value={personCount}
            onChange={(e) => setPersonCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </Field>
        <button onClick={add} disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Hinzufügen
        </button>
      </div>
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">{error}</div>
      )}
    </div>
  );
}