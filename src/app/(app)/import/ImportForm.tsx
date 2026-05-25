"use client";
import { formatDate, formatEUR } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AssignDialog,
  type AssignDialogCategory,
  type AssignDialogProject,
  type Assignment,
} from "./AssignDialog";

type Suggestion = {
  id: string;
  name: string;
  kind: string;
  color: string;
  score: number;
};
type PreviewRow = {
  rowKey: string;
  date: string;
  counterparty: string | null;
  purpose: string | null;
  amount: number;
  category: string | null;
  suggestedCategoryId: string | null;
  suggestions: Suggestion[];
  isDuplicate: boolean;
  isSkippedOlder: boolean;
  matchedMember: string | null;
  externalRef: string | null;
};

type PreviewResp = {
  source: "csv" | "xlsx";
  totalRows: number;
  created: number;
  duplicates: number;
  skippedOlder: number;
  autoMatched: number;
  lastExistingDate: string | null;
  importAll: boolean;
  dryRun: boolean;
  preview: PreviewRow[];
  categories: AssignDialogCategory[];
  projects: AssignDialogProject[];
};

export function ImportForm({
  accounts,
  years,
  defaultClubYearId,
}: {
  accounts: { id: string; name: string; type: string }[];
  years: { id: string; label: string }[];
  defaultClubYearId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.type === "MAIN")?.id ?? accounts[0]?.id,
  );
  const [clubYearId, setClubYearId] = useState(defaultClubYearId);
  const [importAll, setImportAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Filter im Vorschau-Bereich
  const [filter, setFilter] = useState<"all" | "new" | "dup" | "older">("all");
  const visibleRows = useMemo(() => {
    if (!preview) return [] as PreviewRow[];
    if (filter === "all") return preview.preview;
    if (filter === "new")
      return preview.preview.filter((r) => !r.isDuplicate && !r.isSkippedOlder);
    if (filter === "dup") return preview.preview.filter((r) => r.isDuplicate);
    return preview.preview.filter((r) => r.isSkippedOlder);
  }, [preview, filter]);

  async function run(
    dryRun: boolean,
    assignments?: Record<string, Assignment>,
  ) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setAssignError(null);
    setDone(false);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId ?? "");
    fd.append("clubYearId", clubYearId ?? "");
    fd.append("dryRun", dryRun ? "true" : "false");
    fd.append("importAll", importAll ? "true" : "false");
    if (assignments) fd.append("assignments", JSON.stringify(assignments));
    const res = await fetch("/api/import/george", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error ?? "Import fehlgeschlagen.";
      if (dryRun) setError(msg);
      else setAssignError(msg);
      return;
    }
    const data = (await res.json()) as PreviewResp;
    setPreview(data);
    if (!dryRun) {
      setDone(true);
      setAssignOpen(false);
      router.refresh();
    }
  }

  // Initiale Zuordnungen aus Auto-Vorschlägen ableiten
  const initialAssignments = useMemo<Record<string, Assignment>>(() => {
    if (!preview) return {};
    const out: Record<string, Assignment> = {};
    for (const r of preview.preview) {
      if (r.isDuplicate || r.isSkippedOlder) continue;
      out[r.rowKey] = { categoryId: r.suggestedCategoryId, projectId: null };
    }
    return out;
  }, [preview]);

  return (
    <div className="space-y-4">
      <div className="card-soft p-3 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">
              Konto
            </label>
            <select
              className="input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">
              Clubjahr
            </label>
            <select
              className="input"
              value={clubYearId}
              onChange={(e) => setClubYearId(e.target.value)}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">
            Bank-Datei (George Erste Bank, CSV oder XLSX)
          </label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              <FileSpreadsheet className="size-3.5" />
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={importAll}
            onChange={(e) => setImportAll(e.target.checked)}
          />
          <span>
            Auch Zeilen <strong>vor</strong> der letzten vorhandenen Buchung
            importieren (z. B. für initialen Vollimport). Ohne dieses Häkchen
            werden nur neue Buchungen seit der letzten in der App vorhandenen
            Buchung ergänzt.
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
        {done && (
          <div
            role="status"
            className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 flex items-center gap-2"
          >
            <CheckCircle2 className="size-4" /> Import abgeschlossen.
          </div>
        )}

        <div className="flex gap-2 flex-wrap btn-row">
          <button
            className="btn-ghost"
            disabled={!file || busy}
            onClick={() => run(true)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Vorschau
          </button>
          <button
            className="btn-primary"
            disabled={!file || busy || !preview || preview.created === 0}
            onClick={() => setAssignOpen(true)}
            title={
              !preview
                ? "Zuerst Vorschau erzeugen"
                : preview.created === 0
                  ? "Keine neuen Buchungen zu importieren"
                  : "Kategorien prüfen und importieren"
            }
          >
            <Sparkles className="size-4" /> Zuordnung prüfen & importieren
          </button>
          {preview && preview.created > 0 && (
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => run(false)}
              title="Direktimport ohne Prüfdialog (Auto-Kategorien)"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}{" "}
              Direktimport
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div className="card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm space-y-0.5">
                <div>
                  <span className="font-semibold">{preview.totalRows}</span>{" "}
                  Zeilen ·{" "}
                  <span className="font-semibold text-emerald-700">
                    {preview.created} neu
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold text-amber-700">
                    {preview.duplicates} Duplikate
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold text-slate-500">
                    {preview.skippedOlder} älter übersprungen
                  </span>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-blue-700">
                    {preview.autoMatched} Forderungen automatisch ausgeglichen
                  </span>{" "}
                  · Quelle:{" "}
                  <span className="uppercase font-mono text-slate-500">
                    {preview.source}
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-500">
                Vorschau (max. 200)
              </span>
            </div>
            <div className="text-xs flex items-start gap-2 text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2">
              <Info className="size-3.5 shrink-0 mt-0.5 text-blue-600" />
              <div>
                {preview.lastExistingDate ? (
                  <>
                    Letzte vorhandene Buchung im Konto:{" "}
                    <strong>{formatDate(preview.lastExistingDate)}</strong>. Es
                    werden nur neuere Zeilen importiert
                    {preview.importAll ? " (Override aktiv – alle Zeilen)" : ""}
                    .
                  </>
                ) : (
                  <>
                    Keine vorhandene Buchung im Konto – alle Zeilen werden
                    importiert.
                  </>
                )}
              </div>
            </div>

            <div
              className="flex flex-wrap gap-1 text-xs"
              role="tablist"
              aria-label="Vorschau-Filter"
            >
              {(
                [
                  { k: "all", label: `Alle (${preview.preview.length})` },
                  { k: "new", label: `Neu (${preview.created})` },
                  { k: "dup", label: `Duplikate (${preview.duplicates})` },
                  { k: "older", label: `Älter (${preview.skippedOlder})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.k}
                  role="tab"
                  aria-selected={filter === f.k}
                  onClick={() => setFilter(f.k)}
                  className={`px-2.5 py-1 rounded-full border ${
                    filter === f.k
                      ? "bg-[#17458F] text-white border-[#17458F]"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {preview.created > 0 && (
            <div className="px-4 sm:px-5 py-3 bg-blue-50/40 border-b text-xs flex items-start gap-2">
              <Sparkles className="size-4 mt-0.5 shrink-0 text-blue-700" />
              <div className="flex-1">
                <strong>{preview.created} neue Buchungen</strong> sind bereit.
                Klicke auf <strong>„Zuordnung prüfen & importieren"</strong>, um
                Kategorien zu prüfen und Projekte zuzuordnen.
              </div>
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="px-2.5 py-1 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 whitespace-nowrap"
              >
                Zuordnung öffnen →
              </button>
            </div>
          )}
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
                  {visibleRows.map((r, i) => (
                    <tr
                      key={`${r.externalRef ?? "x"}-${i}`}
                      className={
                        r.isDuplicate
                          ? "danger"
                          : r.isSkippedOlder
                            ? "muted"
                            : ""
                      }
                    >
                      <td data-label="Datum" className="whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                      <td data-label="Gegenpartei" className="font-medium">
                        {r.counterparty ?? "—"}
                      </td>
                      <td
                        data-label="Zweck"
                        className="text-slate-600 sm:max-w-[260px] sm:truncate"
                      >
                        {r.purpose ?? "—"}
                      </td>
                      <td data-label="Kategorie">
                        {r.category ? (
                          <span
                            className="chip"
                            style={{
                              background: "#17458F1A",
                              color: "#17458F",
                            }}
                          >
                            {r.category}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        data-label="Mitglied"
                        className="text-slate-500 text-xs"
                      >
                        {r.matchedMember ?? "—"}
                      </td>
                      <td data-label="Status">
                        {r.isSkippedOlder ? (
                          <span
                            className="chip"
                            style={{ background: "#E5E7EB", color: "#475569" }}
                          >
                            Älter – übersprungen
                          </span>
                        ) : r.isDuplicate ? (
                          <span className="chip chip-cancelled">Duplikat</span>
                        ) : (
                          <span className="chip chip-active">Neu</span>
                        )}
                      </td>
                      <td
                        data-label="Betrag"
                        className={`text-right font-mono tabular ${
                          r.amount >= 0 ? "amount-pos" : "amount-neg"
                        }`}
                      >
                        {formatEUR(r.amount)}
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-sm text-slate-500 py-6"
                      >
                        Keine Einträge in dieser Ansicht.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <AssignDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          rows={preview.preview}
          categories={preview.categories}
          projects={preview.projects}
          initialAssignments={initialAssignments}
          onConfirm={(assignments) => run(false, assignments)}
          busy={busy}
          error={assignError}
        />
      )}
    </div>
  );
}
