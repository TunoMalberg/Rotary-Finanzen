"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";

export default function MembersImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/members/import", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) { setError("Import fehlgeschlagen."); return; }
    const data = await res.json();
    setResult(data);
  }

  return (
    <div className="max-w-2xl fade-up">
      <h1 className="font-bold flex items-center gap-2 mb-1"><Upload className="size-6 text-blue-800 shrink-0" /> Mitglieder-Import</h1>
      <p className="text-slate-500 text-sm mb-4 sm:mb-6">
        Excel-Datei mit dem <code className="bg-slate-100 px-1 rounded">MB</code>-Sheet (Membership Report).
        Vorhandene Mitglieder werden anhand der Rotary-ID aktualisiert, neue werden angelegt.
      </p>
      <form onSubmit={submit} className="card-soft p-3 sm:p-6 space-y-4">
        <input type="file" accept=".xlsx" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        {error && <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>}
        {result && (
          <div role="status" className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 flex items-start gap-2">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" /> <span>Import abgeschlossen — neu: {result.created}, aktualisiert: {result.updated}, übersprungen: {result.skipped}.</span>
          </div>
        )}
        <div className="flex gap-2 flex-wrap btn-row">
          <button className="btn-primary" disabled={!file || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importieren
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.push("/members")}>Zurück</button>
        </div>
      </form>
    </div>
  );
}