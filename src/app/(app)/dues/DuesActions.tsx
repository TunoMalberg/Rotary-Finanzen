"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Mail, RefreshCw } from "lucide-react";

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
    alert(data?.created != null ? `Erzeugt: ${data.created}, übersprungen: ${data.skipped}` : "Vorgang abgeschlossen");
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
    <div className="flex gap-2">
      <button className="btn-ghost" onClick={reconcile} disabled={!!busy}>
        {busy === "rec" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Abgleich starten
      </button>
      <button className="btn-primary" onClick={generate} disabled={!!busy}>
        {busy === "gen" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Beiträge generieren
      </button>
    </div>
  );
}