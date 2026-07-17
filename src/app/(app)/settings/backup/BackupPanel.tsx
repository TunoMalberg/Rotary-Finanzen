"use client";
import { useState } from "react";
import { DatabaseBackup, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lädt ein vollständiges Backup der Datenbank als JSON-Datei herunter und
 * bietet es zum lokalen Speichern an. Zeigt Lade- und Fehlerzustand.
 */
export function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      if (!res.ok) {
        let msg = `Fehler ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      // Dateiname aus Content-Disposition oder Fallback mit Datum.
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename =
        match?.[1] ??
        `rotary-finanzen-backup_${new Date().toISOString().slice(0, 10)}.json`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOk(`Backup „${filename}" wurde heruntergeladen.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={download} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
        {busy ? "Backup wird erstellt…" : "Backup jetzt herunterladen"}
      </Button>

      {ok && (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="size-4" /> {ok}
        </p>
      )}
      {error && (
        <p className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="size-4" /> {error}
        </p>
      )}
    </div>
  );
}
