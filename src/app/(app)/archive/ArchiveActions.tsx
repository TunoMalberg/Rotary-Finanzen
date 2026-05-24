"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Plus } from "lucide-react";

export function ArchiveActions() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [yearLabel, setYearLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadHistory() {
    if (!file || !yearLabel) return;
    setBusy(true); setError(null); setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("yearLabel", yearLabel);
    const res = await fetch("/api/archive/upload", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Upload fehlgeschlagen"); return; }
    const data = await res.json();
    setMsg(`Clubjahr ${data.label} importiert. Buchungen: ${data.transactions}`);
    router.refresh();
  }

  async function newYear() {
    const label = prompt("Neues Clubjahr-Label (z.B. 2026/2027):");
    if (!label) return;
    setBusy(true);
    const res = await fetch("/api/clubyears", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? "Fehler"); return; }
    router.refresh();
  }

  return (
    <div className="card-soft p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={newYear} className="btn-ghost"><Plus className="size-4" /> Neues Clubjahr anlegen</button>
      </div>
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2">Historisches Jahr aus Excel-Datei importieren</h3>
        <p className="text-sm text-slate-500 mb-3">Excel-Datei (EAR) hochladen. Die Sheets <code>ERSTE Konto</code>, <code>ERSTE Global Grant</code> und <code>Abschluß</code> werden gelesen.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block">Clubjahr-Label</label>
            <input className="input" placeholder="z.B. 2023/2024" value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold mb-1 block">Excel-Datei (.xlsx)</label>
            <input type="file" accept=".xlsx" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3 mt-3 flex items-center gap-2"><AlertTriangle className="size-4" />{error}</div>}
        {msg && <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 mt-3 flex items-center gap-2"><CheckCircle2 className="size-4" />{msg}</div>}
        <button onClick={uploadHistory} disabled={!file || !yearLabel || busy} className="btn-primary mt-3">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importieren
        </button>
      </div>
    </div>
  );
}