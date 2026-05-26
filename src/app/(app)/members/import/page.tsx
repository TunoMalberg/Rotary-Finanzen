"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

type ImportResult = {
  format: "ClubRoster" | "MB" | "unknown";
  sheetName: string | null;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  deactivated: number;
  issues: { row: string; reason: string }[];
  dryRun: boolean;
};

export default function MembersImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deactivateMissing, setDeactivateMissing] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const params = new URLSearchParams();
    if (dryRun) params.set("dryRun", "1");
    if (deactivateMissing) params.set("deactivateMissing", "1");
    const res = await fetch(`/api/members/import?${params.toString()}`, {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Import fehlgeschlagen.");
      return;
    }
    const data = (await res.json()) as ImportResult;
    setResult(data);
    if (!dryRun) router.refresh();
  }

  return (
    <div className="max-w-2xl fade-up">
      <h1 className="font-bold flex items-center gap-2 mb-1">
        <Upload className="size-6 text-blue-800 shrink-0" />
        Mitglieder-Import
      </h1>
      <p className="text-slate-500 text-sm mb-4 sm:mb-6">
        Excel-Datei mit Mitglieder-Stammdaten. Unterstützt werden:
      </p>
      <ul className="text-xs text-slate-600 mb-4 list-disc pl-5 space-y-0.5">
        <li>
          <strong>ClubRoster.xlsx</strong> (neues Rotary-Export-Format, Sheet{" "}
          <code className="bg-slate-100 px-1 rounded">Mitgliederverzeichnis</code>{" "}
          mit Spalten <em>Mitgliedsnummer · Vorname · Nachname · Adresse · …</em>)
        </li>
        <li>
          Altes Sheet <code className="bg-slate-100 px-1 rounded">MB</code>{" "}
          (Membership Report) – aus EAR-Excel.
        </li>
      </ul>
      <p className="text-xs text-slate-600 mb-4">
        Existierende Mitglieder werden anhand der Rotary-ID aktualisiert; neue
        werden angelegt. <strong>SEPA-Einzug & Befreiungs-Status werden
        nicht überschrieben</strong>, wenn die Datei sie nicht enthält
        (ClubRoster).
      </p>

      <div className="card-soft p-3 sm:p-6 space-y-4">
        <input
          type="file"
          accept=".xlsx"
          className="input"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={deactivateMissing}
            onChange={(e) => setDeactivateMissing(e.target.checked)}
          />
          <span>
            Mitglieder, die <strong>nicht in der Datei</strong> sind, auf{" "}
            <em>INACTIVE</em> setzen (Soft-Deaktivierung; bestehende
            Buchungen/Forderungen bleiben erhalten).
          </span>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3 flex items-start gap-2"
          >
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {result && (
          <div
            role="status"
            className={`rounded-md text-sm p-3 flex items-start gap-2 border ${
              result.dryRun
                ? "bg-blue-50 border-blue-200 text-blue-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {result.dryRun ? (
              <Info className="size-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-semibold">
                {result.dryRun
                  ? "Vorschau (keine Änderung)"
                  : "Import abgeschlossen"}{" "}
                · Format: <code>{result.format}</code> ({result.sheetName ?? "—"})
              </div>
              <div>
                {result.totalRows} Zeilen gelesen · neu:{" "}
                <strong>{result.created}</strong> · aktualisiert:{" "}
                <strong>{result.updated}</strong> · übersprungen:{" "}
                <strong>{result.skipped}</strong>
                {result.deactivated > 0 && (
                  <>
                    {" "}
                    · deaktiviert: <strong>{result.deactivated}</strong>
                  </>
                )}
              </div>
              {result.issues.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer">
                    {result.issues.length} Hinweise
                  </summary>
                  <ul className="list-disc pl-5 mt-1">
                    {result.issues.map((iss, i) => (
                      <li key={i}>
                        {iss.row}: {iss.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap btn-row">
          <button
            type="button"
            className="btn-ghost"
            disabled={!file || busy}
            onClick={() => run(true)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Vorschau
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!file || busy}
            onClick={() => run(false)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}{" "}
            Importieren
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => router.push("/members")}
          >
            Zurück
          </button>
        </div>
      </div>
    </div>
  );
}