"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Lock,
  Unlock,
  CheckCircle2,
  Loader2,
  Download,
  UploadCloud,
  RotateCcw,
  Gavel,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";

type DeletionSummary = {
  clubYearId: string;
  label: string;
  isLocked: boolean;
  isAudited: boolean;
  isClosed: boolean;
  archived: boolean;
  transactions: number;
  invoices: number;
  attendanceLists: number;
  budgetLines: number;
  cashflows: number;
  categories: number;
};

type Year = {
  id: string;
  label: string;
  isClosed: boolean;
  closedAt: string | null;
  auditedAt: string | null;
  lockedAt: string | null;
  archived: boolean;
  hasArchiveFile: boolean;
};

export function YearLifecycleControls({ year, canEdit }: { year: Year; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    summary: { sheetsFound: string[]; parsed: number; updates: number; creates: number; softDeletes: number; matchedDbIds: number; dbTotal: number };
    file: File;
    deleteMissing: boolean;
  } | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletionSummary | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  async function call(url: string, body?: unknown, label?: string) {
    setBusy(label ?? url);
    setError(null);
    setInfo(null);
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? `Fehler (${res.status})`);
      return null;
    }
    return res.json().catch(() => ({}));
  }

  async function close() {
    if (!confirm(`Clubjahr ${year.label} abschließen?\n\nDas Schatzmeister-Buchhaltungs-Jahr wird abgeschlossen. Korrekturen sind danach noch möglich, bis die Mitgliederversammlung das Jahr fixiert.`)) return;
    const r = await call(`/api/clubyears/${year.id}/close`, undefined, "close");
    if (r) {
      setInfo("Clubjahr abgeschlossen, Endsalden ans Folgejahr übernommen.");
      router.refresh();
    }
  }
  async function reopen(stage: "CLOSED" | "AUDITED") {
    const ok = confirm(stage === "AUDITED" ? "Prüfvermerk zurücksetzen?" : "Abschluss zurücknehmen – das Jahr ist dann wieder voll bearbeitbar.");
    if (!ok) return;
    const r = await call(`/api/clubyears/${year.id}/reopen`, { stage }, "reopen");
    if (r) {
      setInfo("Status zurückgesetzt.");
      router.refresh();
    }
  }
  async function audit() {
    const notes = prompt("Optionale Notiz zur Rechnungsprüfung:") ?? undefined;
    const r = await call(`/api/clubyears/${year.id}/audit`, { notes }, "audit");
    if (r) {
      setInfo("Prüfvermerk gesetzt.");
      router.refresh();
    }
  }
  async function lockYear() {
    if (!confirm(`Clubjahr ${year.label} endgültig fixieren?\n\nDas Jahr wird durch den Mitgliederversammlungs-Beschluss fixiert. Es können danach keine Buchungen mehr verändert werden. Eine finale Excel-Datei wird ins Archiv geschrieben.`)) return;
    const r = await call(`/api/clubyears/${year.id}/lock`, undefined, "lock");
    if (r) {
      setInfo(`Clubjahr fixiert. Archiv-Datei „${r.fileName}" abgelegt.`);
      router.refresh();
    }
  }
  async function preview(file: File, deleteMissing: boolean) {
    setImportBusy(true);
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "preview");
    fd.append("deleteMissing", String(deleteMissing));
    const res = await fetch(`/api/clubyears/${year.id}/import`, { method: "POST", body: fd });
    setImportBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Import-Vorschau fehlgeschlagen");
      return;
    }
    const data = await res.json();
    setImportPreview({ summary: data.summary, file, deleteMissing });
  }
  async function startDelete() {
    setError(null);
    setInfo(null);
    setBusy("delete-preview");
    const res = await fetch(`/api/clubyears/${year.id}`);
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Vorschau fehlgeschlagen");
      return;
    }
    const data = (await res.json()) as DeletionSummary;
    setDeleteConfirmText("");
    setDeletePreview(data);
  }

  async function confirmDelete() {
    if (!deletePreview) return;
    if (deleteConfirmText.trim() !== year.label) return;
    setBusy("delete");
    setError(null);
    const total =
      deletePreview.transactions +
      deletePreview.invoices +
      deletePreview.attendanceLists +
      deletePreview.budgetLines +
      deletePreview.cashflows +
      deletePreview.categories;
    const url = total > 0 ? `/api/clubyears/${year.id}?force=1` : `/api/clubyears/${year.id}`;
    const res = await fetch(url, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Löschen fehlgeschlagen");
      return;
    }
    setDeletePreview(null);
    setInfo(`Clubjahr ${year.label} und alle zugehörigen Daten wurden gelöscht.`);
    router.refresh();
  }

  async function commit() {
    if (!importPreview) return;
    setImportBusy(true);
    const fd = new FormData();
    fd.append("file", importPreview.file);
    fd.append("mode", "commit");
    fd.append("deleteMissing", String(importPreview.deleteMissing));
    const res = await fetch(`/api/clubyears/${year.id}/import`, { method: "POST", body: fd });
    setImportBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Import fehlgeschlagen");
      return;
    }
    setImportPreview(null);
    setInfo("Korrekturen übernommen.");
    router.refresh();
  }

  const lifecycleClasses = year.lockedAt
    ? "chip chip-cancelled"
    : year.auditedAt
      ? "chip chip-warn"
      : year.isClosed
        ? "chip chip-info"
        : "chip chip-active";
  const lifecycleLabel = year.lockedAt
    ? "Fixiert (MV)"
    : year.auditedAt
      ? "Geprüft"
      : year.isClosed
        ? "Abgeschlossen"
        : "Laufend";
  const lifecycleIcon = year.lockedAt ? <Lock className="size-3" /> : year.auditedAt ? <Gavel className="size-3" /> : year.isClosed ? <CheckCircle2 className="size-3" /> : <Unlock className="size-3" />;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={lifecycleClasses}>
        {lifecycleIcon} {lifecycleLabel}
      </span>

      <a
        href={`/api/clubyears/${year.id}/export`}
        className="btn-ghost text-xs"
        title="Aktuelles Jahr als EAR-Excel herunterladen"
      >
        <Download className="size-3.5" /> Excel-Export
      </a>

      {year.hasArchiveFile && (
        <a
          href={`/api/clubyears/${year.id}/archive-file`}
          className="btn-ghost text-xs"
          title="Beim Lock erzeugtes Archiv-Excel herunterladen"
        >
          <FileSpreadsheet className="size-3.5" /> Archiv-Datei
        </a>
      )}

      {canEdit && !year.lockedAt && (
        <ImportTrigger busy={importBusy} onPick={preview} />
      )}

      {canEdit && !year.isClosed && (
        <button onClick={close} disabled={!!busy} className="btn-ghost text-xs">
          {busy === "close" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Jahr abschließen
        </button>
      )}
      {canEdit && year.isClosed && !year.auditedAt && !year.lockedAt && (
        <>
          <button onClick={audit} disabled={!!busy} className="btn-ghost text-xs">
            {busy === "audit" ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />} Prüfvermerk
          </button>
          <button onClick={() => reopen("CLOSED")} disabled={!!busy} className="btn-ghost text-xs">
            {busy === "reopen" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Wieder öffnen
          </button>
        </>
      )}
      {canEdit && year.auditedAt && !year.lockedAt && (
        <>
          <button onClick={lockYear} disabled={!!busy} className="btn-primary text-xs">
            {busy === "lock" ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />} Mitgliederversammlung: fixieren
          </button>
          <button onClick={() => reopen("AUDITED")} disabled={!!busy} className="btn-ghost text-xs">
            {busy === "reopen" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Prüfvermerk zurück
          </button>
        </>
      )}

      {canEdit && !year.lockedAt && (
        <button
          onClick={startDelete}
          disabled={!!busy}
          className="btn-ghost text-xs text-rose-700 hover:bg-rose-50"
          title="Clubjahr und alle zugehörigen Daten löschen"
        >
          {busy === "delete-preview" || busy === "delete" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}{" "}
          Löschen
        </button>
      )}

      {error && (
        <div role="alert" className="basis-full mt-2 text-xs text-red-700 inline-flex items-start gap-1">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {info && <output className="basis-full mt-2 text-xs text-emerald-700">{info}</output>}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          busy={importBusy}
          onCancel={() => setImportPreview(null)}
          onCommit={commit}
        />
      )}

      {deletePreview && (
        <DeleteConfirmModal
          summary={deletePreview}
          year={year}
          confirmText={deleteConfirmText}
          onChangeConfirmText={setDeleteConfirmText}
          busy={busy === "delete"}
          onCancel={() => {
            setDeletePreview(null);
            setDeleteConfirmText("");
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function ImportTrigger({ busy, onPick }: { busy: boolean; onPick: (file: File, deleteMissing: boolean) => void }) {
  const [del, setDel] = useState(false);
  return (
    <label className="btn-ghost text-xs cursor-pointer">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />} Excel-Korrektur importieren
      <input
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f, del);
          e.target.value = "";
        }}
      />
      <input type="checkbox" className="ml-2" checked={del} onChange={(e) => setDel(e.target.checked)} title="Buchungen, die nicht mehr im Excel stehen, soft-löschen" />
      <span className="text-[10px] text-slate-500">missing löschen</span>
    </label>
  );
}

function ImportPreviewModal({
  preview,
  busy,
  onCancel,
  onCommit,
}: {
  preview: { summary: { sheetsFound: string[]; parsed: number; updates: number; creates: number; softDeletes: number; matchedDbIds: number; dbTotal: number }; file: File; deleteMissing: boolean };
  busy: boolean;
  onCancel: () => void;
  onCommit: () => void;
}) {
  return (
    <div aria-modal="true" aria-labelledby="import-preview-title" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="card-soft p-5 max-w-lg w-full">
        <h3 id="import-preview-title" className="text-lg font-semibold mb-2">Excel-Korrektur: Vorschau</h3>
        <p className="text-sm text-slate-500 mb-3">Datei: <code>{preview.file.name}</code></p>
        <ul className="text-sm space-y-1 mb-4">
          <li>Gefundene Sheets: <strong>{preview.summary.sheetsFound.join(", ") || "—"}</strong></li>
          <li>Excel-Zeilen geparst: <strong>{preview.summary.parsed}</strong></li>
          <li>Datenbank-Buchungen im Jahr: <strong>{preview.summary.dbTotal}</strong></li>
          <li>Updates: <strong className="text-blue-700">{preview.summary.updates}</strong></li>
          <li>Neuanlagen: <strong className="text-emerald-700">{preview.summary.creates}</strong></li>
          {preview.deleteMissing && <li>Soft-Deletes: <strong className="text-red-700">{preview.summary.softDeletes}</strong></li>}
        </ul>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">Abbrechen</button>
          <button onClick={onCommit} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
function DeleteConfirmModal({
  summary,
  year,
  confirmText,
  onChangeConfirmText,
  busy,
  onCancel,
  onConfirm,
}: {
  summary: DeletionSummary;
  year: Year;
  confirmText: string;
  onChangeConfirmText: (s: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total =
    summary.transactions +
    summary.invoices +
    summary.attendanceLists +
    summary.budgetLines +
    summary.cashflows +
    summary.categories;
  const canConfirm = confirmText.trim() === year.label && !busy;
  return (
    <div
      aria-modal="true"
      aria-labelledby="delete-year-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="card-soft p-5 max-w-lg w-full">
        <h3
          id="delete-year-title"
          className="text-lg font-semibold mb-2 flex items-center gap-2 text-rose-700"
        >
          <Trash2 className="size-5" /> Clubjahr {year.label} löschen
        </h3>

        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-800 text-sm p-3 mb-3 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <strong>Diese Aktion kann nicht rückgängig gemacht werden.</strong>
            <br />
            Alle Buchungen, Forderungen, Auslagenlisten, Budget-Einträge,
            Cashflow-Planungen und jahres-spezifischen Kategorien dieses
            Clubjahres werden unwiderruflich entfernt.
          </div>
        </div>

        {total === 0 ? (
          <p className="text-sm text-slate-600 mb-3">
            Dieses Clubjahr enthält keine Daten – nur der Jahres-Eintrag selbst
            wird gelöscht.
          </p>
        ) : (
          <ul className="text-sm space-y-1 mb-4">
            {summary.transactions > 0 && (
              <li>
                Buchungen:{" "}
                <strong className="text-rose-700">{summary.transactions}</strong>
              </li>
            )}
            {summary.invoices > 0 && (
              <li>
                Forderungen (Beiträge & Auslagen):{" "}
                <strong className="text-rose-700">{summary.invoices}</strong>
              </li>
            )}
            {summary.attendanceLists > 0 && (
              <li>
                Teilnahmelisten:{" "}
                <strong className="text-rose-700">{summary.attendanceLists}</strong>
              </li>
            )}
            {summary.budgetLines > 0 && (
              <li>
                Budget-Einträge:{" "}
                <strong className="text-rose-700">{summary.budgetLines}</strong>
              </li>
            )}
            {summary.cashflows > 0 && (
              <li>
                Cashflow-Einträge:{" "}
                <strong className="text-rose-700">{summary.cashflows}</strong>
              </li>
            )}
            {summary.categories > 0 && (
              <li>
                Jahres-Kategorien:{" "}
                <strong className="text-rose-700">{summary.categories}</strong>
              </li>
            )}
            {summary.archived && (
              <li>Archiv-Datei wird mitgelöscht.</li>
            )}
          </ul>
        )}

        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Zur Bestätigung gib bitte „{year.label}" exakt ein:
        </label>
        <input
          autoFocus
          className="input mb-4"
          value={confirmText}
          onChange={(e) => onChangeConfirmText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canConfirm) onConfirm();
          }}
          placeholder={year.label}
        />

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost" disabled={busy}>
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="btn-primary"
            style={{ background: canConfirm ? "#b91c1c" : undefined }}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}{" "}
            Endgültig löschen
          </button>
        </div>
      </div>
    </div>
  );
}
