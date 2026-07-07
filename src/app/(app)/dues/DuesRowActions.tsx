"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, Check, Loader2, RotateCcw, Pencil, Trash2, X } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";

export function DuesRowActions({ invoice }: { invoice: { id: string; status: string; memberEmail: string | null; memberName: string; amount: number; reference: string; dueDate: string; reminderLevel: number; paymentMethod: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    amount: String(invoice.amount),
    dueDate: invoice.dueDate.slice(0, 10),
    paymentMethod: invoice.paymentMethod,
  });

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(String(form.amount).replace(",", ".")),
          dueDate: form.dueDate,
          paymentMethod: form.paymentMethod,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error ?? `Fehler ${res.status}`);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeInvoice() {
    if (!confirm(`Forderung „${invoice.reference}" endgültig löschen?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}?hard=1`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (res.status === 409) {
        if (confirm(`${d?.error ?? "Löschen nicht möglich."}\n\nStattdessen stornieren?`)) {
          const res2 = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
          if (res2.ok) router.refresh();
          else alert((await res2.json().catch(() => ({})))?.error ?? "Fehler");
        }
        return;
      }
      alert(d?.error ?? `Fehler ${res.status}`);
    } finally {
      setBusy(false);
    }
  }

  function buildMailto() {
    const lvl = invoice.reminderLevel + 1;
    const subject = lvl === 1 ? `Erinnerung Mitgliedsbeitrag (${invoice.reference})` : `${lvl - 1}. Mahnung Mitgliedsbeitrag (${invoice.reference})`;
    const body =
      `Lieber Freund/liebe Freundin ${invoice.memberName},\n\n` +
      `auf unserem Konto ist Ihr Mitgliedsbeitrag in Höhe von ${formatEUR(invoice.amount)} (Referenz ${invoice.reference}, fällig ${formatDate(invoice.dueDate)}) noch nicht eingelangt.\n\n` +
      `Wir bitten höflich um Begleichung auf das Konto:\nIBAN AT41 2011 1310 0670 0296\nVerwendungszweck: ${invoice.reference}\n\n` +
      `Bei Rückfragen stehe ich gerne zur Verfügung.\n\nMit besten rotarischen Grüßen,\nDer Schatzmeister\nRotary Club Wien-Donau`;
    const mail = `mailto:${invoice.memberEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return mail;
  }

  async function remind() {
    setBusy(true);
    // log reminder, then open mail client
    const res = await fetch(`/api/invoices/${invoice.id}/remind`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      window.open(buildMailto(), "_blank");
      router.refresh();
    }
  }

  async function markPaid() {
    setBusy(true);
    await fetch(`/api/invoices/${invoice.id}/markPaid`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function reopen() {
    setBusy(true);
    const res = await fetch(`/api/invoices/${invoice.id}/reopen`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.message ?? `Fehler ${res.status}`);
      return;
    }
    router.refresh();
  }

  if (invoice.status === "CANCELLED") return null;

  // Bezahlte Forderungen: nur „Wieder öffnen" anbieten (z. B. nach Rückbuchung).
  if (invoice.status === "PAID") {
    return (
      <div className="flex justify-end gap-1">
        <button
          onClick={reopen}
          disabled={busy}
          className="btn-ghost text-xs px-2 py-1"
          title="Forderung wieder auf offen setzen (z. B. nach Rückbuchung)"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Wieder offen
        </button>
      </div>
    );
  }

  // Offen / Gemahnt: Mahnen, Bezahlt, Bearbeiten, Löschen.
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-1 flex-wrap">
        <button onClick={remind} disabled={busy} className="btn-ghost text-xs px-2 py-1" title="Mahn-Mail senden">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Mahnen
        </button>
        <button onClick={markPaid} disabled={busy} className="btn-ghost text-xs px-2 py-1" title="Als bezahlt markieren">
          <Check className="size-3.5" /> Bezahlt
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
          className="btn-ghost text-xs px-2 py-1"
          title="Betrag / Fälligkeit / Methode bearbeiten"
        >
          {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
        </button>
        <button
          onClick={removeInvoice}
          disabled={busy}
          className="btn-ghost text-xs px-2 py-1 text-rose-600 hover:bg-rose-50"
          title="Forderung löschen / stornieren"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {editing && (
        <form
          onSubmit={saveEdit}
          className="mt-1 w-full sm:w-auto text-left rounded-lg border border-slate-200 bg-white p-3 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          <label className="text-[11px] font-semibold text-slate-600 flex flex-col gap-1">
            Betrag (EUR)
            <input
              type="text"
              inputMode="decimal"
              className="input font-mono py-1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 flex flex-col gap-1">
            Fällig
            <input
              type="date"
              className="input py-1"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 flex flex-col gap-1">
            Methode
            <select
              className="input py-1"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="SEPA">Einzug (EZ)</option>
              <option value="EMAIL_INVOICE">E-Mail-Rechnung</option>
            </select>
          </label>
          <div className="sm:col-span-3 flex gap-2 justify-end">
            <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
            <button type="submit" disabled={busy} className="btn-primary text-xs px-3 py-1">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Speichern
            </button>
          </div>
        </form>
      )}
    </div>
  );
}