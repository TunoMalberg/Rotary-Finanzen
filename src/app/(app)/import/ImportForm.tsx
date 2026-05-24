"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDate, formatEUR } from "@/lib/format";

type PreviewRow = {
  date: string; counterparty: string | null; purpose: string | null; amount: number;
  category?: string | null; isDuplicate: boolean; matchedMember?: string | null;
};

export function ImportForm({ accounts, years, defaultClubYearId }: { accounts: { id: string; name: string; type: string }[]; years: { id: string; label: string }[]; defaultClubYearId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === "MAIN")?.id ?? accounts[0]?.id);
  const [clubYearId, setClubYearId] = useState(defaultClubYearId);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ created: number; duplicates: number; autoMatched: number; totalRows: number; preview: PreviewRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true); setError(null); setDone(false);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId ?? "");
    fd.append("clubYearId", clubYearId ?? "");
    fd.append("dryRun", dryRun ? "true" : "false");
    const res = await fetch("/api/import/george", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Import fehlgeschlagen.");
      return;
    }
    const data = await res.json();
    setPreview(data);
    if (!dryRun) {
      setDone(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-3 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Konto</label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Clubjahr</label>
            <select className="input" value={clubYearId} onChange={(e) => setClubYearId(e.target.value)}>
              {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">CSV-Datei (George Export)</label>
          <input type="file" accept=".csv,text/csv" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {error && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}
        {done && (
          <div role="status" className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 flex items-center gap-2">
            <CheckCircle2 className="size-4" /> Import abgeschlossen.
          </div>
        )}
        <div className="flex gap-2 flex-wrap btn-row">
          <button className="btn-ghost" disabled={!file || busy} onClick={() => run(true)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Vorschau
          </button>
          <button className="btn-primary" disabled={!file || busy} onClick={() => run(false)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importieren
          </button>
        </div>
      </div>

      {preview && (
        <div className="card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm space-y-0.5">
              <div><span className="font-semibold">{preview.totalRows}</span> Zeilen · <span className="font-semibold text-emerald-700">{preview.created} neu</span> · <span className="font-semibold text-amber-700">{preview.duplicates} Duplikate</span></div>
              <div className="text-xs"><span className="font-semibold text-blue-700">{preview.autoMatched} Forderungen automatisch ausgeglichen</span></div>
            </div>
            <span className="text-xs text-slate-500">Vorschau (max. 100)</span>
          </div>
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll max-h-[480px]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Gegenpartei</th>
                    <th>Verwendungszweck</th>
                    <th>Kategorie</th>
                    <th>Mitglied</th>
                    <th>Status</th>
                    <th className="text-right">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((r, i) => (
                    <tr key={i} className={r.isDuplicate ? "danger" : ""}>
                      <td data-label="Datum" className="whitespace-nowrap">{formatDate(r.date)}</td>
                      <td data-label="Gegenpartei" className="font-medium">{r.counterparty ?? "—"}</td>
                      <td data-label="Zweck" className="text-slate-600 sm:max-w-[260px] sm:truncate">{r.purpose ?? "—"}</td>
                      <td data-label="Kategorie">{r.category ? <span className="chip" style={{ background: "#17458F1A", color: "#17458F" }}>{r.category}</span> : "—"}</td>
                      <td data-label="Mitglied" className="text-slate-500 text-xs">{r.matchedMember ?? "—"}</td>
                      <td data-label="Status">
                        {r.isDuplicate
                          ? <span className="chip chip-cancelled">Duplikat</span>
                          : <span className="chip chip-active">Neu</span>}
                      </td>
                      <td data-label="Betrag" className={`text-right font-mono tabular ${r.amount >= 0 ? "amount-pos" : "amount-neg"}`}>{formatEUR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}