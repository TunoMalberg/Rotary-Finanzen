"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Mail, RefreshCw, Send } from "lucide-react";

export function DuesActions({ clubYearId }: { clubYearId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function generate() {
    setBusy("gen");
    const res = await fetch("/api/dues/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubYearId }),
    });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (data?.created != null) {
      alert(
        `Beiträge erzeugt: ${data.created} (übersprungen: ${data.skipped})\n` +
          `• per E-Mail-Rechnung: ${data.invoice ?? 0}\n` +
          `• per Einzug (EZ): ${data.sepa ?? 0}\n\n` +
          `Fällig ab 1.7., zahlbar bis 30.9.`,
      );
    } else {
      alert("Vorgang abgeschlossen");
    }
    router.refresh();
  }
  async function sendInvoices() {
    if (!confirm("Beitrags-Rechnungen jetzt per E-Mail an alle Mitglieder ohne Einzug (EZ) versenden?")) return;
    setBusy("send");
    const res = await fetch("/api/dues/send-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubYearId }),
    });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      alert(data?.error ?? `Fehler ${res.status}`);
      return;
    }
    let msg =
      `Rechnungsversand abgeschlossen.\n\n` +
      `• Versendet: ${data.sent}\n` +
      `• Bereits versendet: ${data.alreadySent}\n` +
      `• Ohne E-Mail-Adresse: ${data.noEmail}\n` +
      `• Fehlgeschlagen: ${data.failed}`;
    if (data.failures?.length) msg += `\n\nFehler bei:\n- ${data.failures.join("\n- ")}`;
    alert(msg);
    router.refresh();
  }
  async function reconcile() {
    setBusy("rec");
    const res = await fetch("/api/dues/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubYearId }) });
    const data = await res.json().catch(() => null);
    setBusy(null);
    alert(data?.matched != null ? `${data.matched} Forderungen gematcht` : "Vorgang abgeschlossen");
    router.refresh();
  }
  return (
    <div className="flex gap-2 flex-wrap">
      <button className="btn-ghost" onClick={reconcile} disabled={!!busy}>
        {busy === "rec" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Abgleich starten
      </button>
      <button className="btn-ghost" onClick={sendInvoices} disabled={!!busy} title="Rechnungen per E-Mail an alle ohne Einzug (EZ) versenden">
        {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Rechnungen versenden
      </button>
      <button className="btn-primary" onClick={generate} disabled={!!busy}>
        {busy === "gen" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Beiträge generieren
      </button>
    </div>
  );
}