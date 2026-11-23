"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, Check, Loader2, RotateCcw, Pencil, Trash2, X, Send } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";

const CLUB_IBAN = "AT41 2011 1310 0670 0296";
const CLUB_NAME = "Rotary Club Wien-Donau";
const TREASURER_NAME = "Tuno Malberg";

export function DuesRowActions({ invoice }: { invoice: { id: string; status: string; memberEmail: string | null; memberName: string; memberFirstName: string; memberIban: string | null; clubYearLabel: string; amount: number; reference: string; dueDate: string; reminderLevel: number; paymentMethod: string; invoiceSentAt: string | null } }) {
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

  const anrede = `Lieber Freund, liebe Freundin ${invoice.memberFirstName},`;

  // Freundliche, kollegiale Zahlungserinnerung (rotarisches „Du").
  function buildMailto() {
    const lvl = invoice.reminderLevel + 1;
    const subject =
      lvl <= 1
        ? `Freundliche Erinnerung – Mitgliedsbeitrag (${invoice.reference})`
        : `Nochmalige freundliche Erinnerung – Mitgliedsbeitrag (${invoice.reference})`;
    const body =
      `${anrede}\n\n` +
      `Dein Mitgliedsbeitrag für das Clubjahr ${invoice.clubYearLabel} ist bei uns noch nicht eingegangen – daher diese Erinnerung.\n\n` +
      `Falls Du bereits überwiesen hast, hat sich das hier einfach überschnitten – dann sag mir kurz Bescheid, und ich gleiche es ab.\n\n` +
      `Ansonsten bitte den Betrag auf unser Clubkonto überweisen:\n` +
      `IBAN ${CLUB_IBAN} / Verwendungszweck ${invoice.reference} / Betrag ${formatEUR(invoice.amount)}\n\n` +
      `Herzlichen Dank und liebe rotarische Grüße\nDein Schatzmeister\n${TREASURER_NAME}\n${CLUB_NAME}`;
    return `mailto:${invoice.memberEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // SEPA-Rücklauf: Einzug kam retour → IBAN prüfen + um einmalige Überweisung bitten.
  function buildReturnMailto() {
    const subject = `Mitgliedsbeitrag – Lastschrift kam retour (${invoice.reference})`;
    const ibanInline = invoice.memberIban
      ? invoice.memberIban
      : "(bei uns ist derzeit keine IBAN hinterlegt)";
    const body =
      `${anrede}\n\n` +
      `wie jedes Jahr ziehen wir den Mitgliedsbeitrag für Dich bequem per SEPA-Lastschrift ein. Bei Dir ist der Einzug für das Clubjahr ${invoice.clubYearLabel} allerdings zu uns zurückgekommen.\n\n` +
      `Wir haben folgende Bankverbindung hinterlegt: ${ibanInline}\n\n` +
      `Darf ich Dich bitten, kurz zu prüfen, ob diese IBAN noch stimmt? Falls sie sich geändert hat, gib mir bitte die aktuelle bekannt – dann klappt der Einzug nächstes Jahr wieder automatisch.\n\n` +
      `Für den heurigen Beitrag bitte ich Dich um eine einmalige Überweisung:\n` +
      `IBAN ${CLUB_IBAN} / Verwendungszweck ${invoice.reference} / Betrag ${formatEUR(invoice.amount)}\n\n` +
      `Ganz herzlichen Dank und liebe rotarische Grüße\nDein Schatzmeister\n${TREASURER_NAME}\n${CLUB_NAME}`;
    return `mailto:${invoice.memberEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function sendInvoice() {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send-invoice`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d?.error ?? `Fehler ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function openDraft(href: string) {
    // Fertige Mail im Standard-Mailprogramm (Outlook) öffnen. Das MUSS synchron
    // in der Klick-Aktion passieren – nach einem await (Server-Abfrage) blockiert
    // der Browser das Öffnen als vermeintliches Popup.
    const a = document.createElement("a");
    a.href = href;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function sendViaOutlook(href: string, confirmText: string, note: string) {
    if (!invoice.memberEmail) {
      alert("Für dieses Mitglied ist keine E-Mail-Adresse hinterlegt. Bitte zuerst beim Mitglied ergänzen.");
      return;
    }
    // 1) Outlook sofort mit der fertigen Mail öffnen (innerhalb der Klick-Aktion).
    openDraft(href);
    // 2) Erst nach dem tatsächlichen Versand vermerken.
    const sent = window.confirm(confirmText);
    if (!sent) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error ?? `Fehler ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function remind() {
    return sendViaOutlook(
      buildMailto(),
      `Die Erinnerung wurde in Outlook geöffnet.\n\n` +
        `Bitte dort auf „Senden" klicken.\n\n` +
        `Danach hier mit „OK" bestätigen – dann wird die Forderung als „gemahnt" markiert.\n` +
        `Falls Outlook nicht aufgegangen ist oder Sie noch nicht gesendet haben: „Abbrechen".`,
      "Zahlungserinnerung per E-Mail",
    );
  }

  function remindReturn() {
    return sendViaOutlook(
      buildReturnMailto(),
      `Die E-Mail zum Lastschrift-Rücklauf wurde in Outlook geöffnet.\n\n` +
        `Bitte dort auf „Senden" klicken.\n\n` +
        `Danach hier mit „OK" bestätigen – dann wird die Forderung als kontaktiert markiert.\n` +
        `Falls Outlook nicht aufgegangen ist oder Sie noch nicht gesendet haben: „Abbrechen".`,
      "SEPA-Rücklauf: IBAN-Prüfung & Bitte um Überweisung",
    );
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
        {invoice.paymentMethod === "SEPA" ? (
          <button
            onClick={remindReturn}
            disabled={busy}
            className="btn-ghost text-xs px-2 py-1"
            title="Lastschrift-Rücklauf: E-Mail mit IBAN-Prüfung und Bitte um Überweisung öffnen"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Rücklauf-Mail
          </button>
        ) : (
          <>
            <button
              onClick={sendInvoice}
              disabled={busy}
              className="btn-ghost text-xs px-2 py-1"
              title={invoice.invoiceSentAt ? `Rechnung erneut senden (zuletzt ${formatDate(invoice.invoiceSentAt)})` : "Rechnung per E-Mail senden"}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {invoice.invoiceSentAt ? "Erneut" : "Rechnung"}
            </button>
            <button onClick={remind} disabled={busy} className="btn-ghost text-xs px-2 py-1" title="Freundliche Zahlungserinnerung per E-Mail öffnen">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Erinnern
            </button>
          </>
        )}
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