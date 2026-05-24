"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";

export function DuesRowActions({ invoice }: { invoice: { id: string; status: string; memberEmail: string | null; memberName: string; amount: number; reference: string; dueDate: string; reminderLevel: number; paymentMethod: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
    if (!confirm("Forderung als bezahlt markieren?")) return;
    setBusy(true);
    await fetch(`/api/invoices/${invoice.id}/markPaid`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") return null;
  return (
    <div className="flex justify-end gap-1">
      <button onClick={remind} disabled={busy} className="btn-ghost text-xs px-2 py-1" title="Mahn-Mail senden">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Mahnen
      </button>
      <button onClick={markPaid} disabled={busy} className="btn-ghost text-xs px-2 py-1" title="Als bezahlt markieren">
        <Check className="size-3.5" /> Bezahlt
      </button>
    </div>
  );
}