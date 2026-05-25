"use client";
import { formatDate, formatEUR } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

export type AssignDialogCategory = {
  id: string;
  name: string;
  kind: string;
  color: string;
  clubYearId: string | null;
};
export type AssignDialogProject = {
  id: string;
  code: string;
  name: string;
  color: string;
};

export type Assignment = {
  categoryId: string | null;
  projectId: string | null;
};

export function AssignDialog({
  open,
  onClose,
  rows,
  categories,
  projects,
  initialAssignments,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  rows: PreviewRow[];
  categories: AssignDialogCategory[];
  projects: AssignDialogProject[];
  initialAssignments: Record<string, Assignment>;
  onConfirm: (assignments: Record<string, Assignment>) => void | Promise<void>;
  busy: boolean;
  error: string | null;
}) {
  const [assignments, setAssignments] =
    useState<Record<string, Assignment>>(initialAssignments);
  const [filter, setFilter] = useState<"all" | "uncat" | "auto" | "edited">(
    "all",
  );

  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  const newRows = useMemo(
    () => rows.filter((r) => !r.isDuplicate && !r.isSkippedOlder),
    [rows],
  );

  const visibleRows = useMemo(() => {
    switch (filter) {
      case "uncat":
        return newRows.filter((r) => !assignments[r.rowKey]?.categoryId);
      case "edited":
        return newRows.filter((r) => {
          const a = assignments[r.rowKey];
          return a && a.categoryId !== r.suggestedCategoryId;
        });
      case "auto":
        return newRows.filter((r) => {
          const a = assignments[r.rowKey];
          return !a || a.categoryId === r.suggestedCategoryId;
        });
      default:
        return newRows;
    }
  }, [newRows, filter, assignments]);

  const stats = useMemo(() => {
    let auto = 0;
    let edited = 0;
    let uncat = 0;
    for (const r of newRows) {
      const a = assignments[r.rowKey];
      const catId = a?.categoryId ?? null;
      if (!catId) uncat++;
      else if (catId === r.suggestedCategoryId) auto++;
      else edited++;
    }
    return { auto, edited, uncat, total: newRows.length };
  }, [newRows, assignments]);

  function setAssignment(rowKey: string, patch: Partial<Assignment>) {
    setAssignments((prev) => {
      const cur = prev[rowKey] ?? { categoryId: null, projectId: null };
      return { ...prev, [rowKey]: { ...cur, ...patch } };
    });
  }

  function applySuggestionAll(categoryId: string | null) {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const r of newRows) {
        if (!next[r.rowKey]?.categoryId) {
          next[r.rowKey] = {
            categoryId,
            projectId: next[r.rowKey]?.projectId ?? null,
          };
        }
      }
      return next;
    });
  }

  function applyAutoAll() {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const r of newRows) {
        next[r.rowKey] = {
          categoryId: r.suggestedCategoryId,
          projectId: next[r.rowKey]?.projectId ?? null,
        };
      }
      return next;
    });
  }

  function applyProjectByPattern(pattern: string, projectId: string | null) {
    if (!pattern.trim()) return;
    const rx = new RegExp(pattern, "i");
    setAssignments((prev) => {
      const next = { ...prev };
      for (const r of newRows) {
        if (rx.test(`${r.purpose ?? ""} ${r.counterparty ?? ""}`)) {
          next[r.rowKey] = {
            categoryId: next[r.rowKey]?.categoryId ?? null,
            projectId,
          };
        }
      }
      return next;
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Schließen"
        onClick={() => (busy ? null : onClose())}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        disabled={busy}
      />
      <div className="relative bg-white w-full sm:max-w-7xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start gap-3 bg-gradient-to-r from-blue-50 to-transparent">
          <span className="inline-flex size-9 items-center justify-center rounded-lg shrink-0 bg-blue-100 text-blue-800">
            <Sparkles className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Schritt 2: Zuordnung prüfen
            </div>
            <div className="text-lg font-bold">
              Kategorie & Projekt zuordnen
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {stats.total} neue Buchungen ·{" "}
              <span className="font-semibold text-emerald-700">
                {stats.auto} automatisch
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-blue-700">
                {stats.edited} geändert
              </span>{" "}
              ·{" "}
              {stats.uncat > 0 ? (
                <span className="font-semibold text-amber-700">
                  {stats.uncat} ohne Kategorie
                </span>
              ) : (
                <span className="font-semibold text-emerald-700">
                  alle zugeordnet
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-50"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Bulk-Actions */}
        <div className="px-5 py-3 border-b bg-slate-50 flex flex-wrap gap-2 items-center text-xs">
          <button
            type="button"
            onClick={applyAutoAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-slate-700"
          >
            <Wand2 className="size-3.5" /> Alle Auto-Vorschläge übernehmen
          </button>
          <ProjectBulk projects={projects} onApply={applyProjectByPattern} />
          <button
            type="button"
            onClick={() => applySuggestionAll(null)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-slate-700"
          >
            Alle leeren
          </button>

          <div className="ml-auto flex flex-wrap gap-1" role="tablist">
            {(
              [
                { k: "all", label: `Alle (${newRows.length})` },
                { k: "auto", label: `Auto (${stats.auto})` },
                { k: "edited", label: `Geändert (${stats.edited})` },
                { k: "uncat", label: `Offen (${stats.uncat})` },
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
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="m-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm flex items-start gap-2"
          >
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />{" "}
            <div>{error}</div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {visibleRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Keine Einträge in dieser Ansicht.
            </div>
          ) : (
            <table className="data-table">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb] z-10">
                <tr>
                  <th className="whitespace-nowrap">Datum</th>
                  <th>Empfänger / Zahler</th>
                  <th>Verwendungszweck</th>
                  <th className="text-right whitespace-nowrap">Betrag</th>
                  <th className="min-w-[260px]">Kategorie</th>
                  <th className="min-w-[180px]">Projekt</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const a = assignments[r.rowKey] ?? {
                    categoryId: null,
                    projectId: null,
                  };
                  const isAuto = a.categoryId === r.suggestedCategoryId;
                  const isEdited =
                    !!r.suggestedCategoryId &&
                    a.categoryId !== r.suggestedCategoryId &&
                    a.categoryId !== null;
                  const kindFilter = r.amount >= 0 ? "INCOME" : "EXPENSE";
                  const eligibleCats = categories.filter(
                    (c) => c.kind === "NEUTRAL" || c.kind === kindFilter,
                  );
                  return (
                    <tr
                      key={r.rowKey}
                      className={!a.categoryId ? "bg-amber-50/40" : ""}
                    >
                      <td className="whitespace-nowrap text-slate-600 align-top">
                        {formatDate(r.date)}
                      </td>
                      <td className="font-medium align-top">
                        {r.counterparty ?? "—"}
                      </td>
                      <td
                        className="text-slate-600 max-w-[36ch] truncate align-top"
                        title={r.purpose ?? ""}
                      >
                        {r.purpose ?? "—"}
                      </td>
                      <td
                        className={`text-right font-mono tabular whitespace-nowrap align-top ${r.amount >= 0 ? "amount-pos" : "amount-neg"}`}
                      >
                        {formatEUR(r.amount)}
                      </td>
                      <td className="align-top">
                        <div className="space-y-1.5">
                          <select
                            className="input text-sm"
                            value={a.categoryId ?? ""}
                            onChange={(e) =>
                              setAssignment(r.rowKey, {
                                categoryId: e.target.value || null,
                              })
                            }
                          >
                            <option value="">— Keine Kategorie —</option>
                            <optgroup
                              label={
                                kindFilter === "INCOME"
                                  ? "Einnahmen"
                                  : "Ausgaben"
                              }
                            >
                              {eligibleCats
                                .filter((c) => c.kind !== "NEUTRAL")
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.clubYearId ? "  (Jahres-Kat.)" : ""}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                          {(r.suggestions.length > 0 ||
                            r.suggestedCategoryId) && (
                            <div className="flex flex-wrap gap-1">
                              {isAuto && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="size-3" /> Auto
                                </span>
                              )}
                              {isEdited && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  Geändert
                                </span>
                              )}
                              {r.suggestions.slice(0, 3).map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() =>
                                    setAssignment(r.rowKey, {
                                      categoryId: s.id,
                                    })
                                  }
                                  title={`Vorschlag · Score ${s.score}`}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                                    a.categoryId === s.id
                                      ? "border-blue-400 bg-blue-50 text-blue-800 font-semibold"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  }`}
                                  style={
                                    a.categoryId === s.id
                                      ? undefined
                                      : {
                                          color: s.color,
                                          borderColor: `${s.color}40`,
                                        }
                                  }
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="align-top">
                        <select
                          className="input text-sm"
                          value={a.projectId ?? ""}
                          onChange={(e) =>
                            setAssignment(r.rowKey, {
                              projectId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">— Kein Projekt —</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} – {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-white flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Tipp: Vorschlags-Chips klicken übernimmt eine Kategorie. ESC
            schließt.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-white border text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => onConfirm(assignments)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#17458F] text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-[#0d3373] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {stats.total} Buchungen importieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectBulk({
  projects,
  onApply,
}: {
  projects: AssignDialogProject[];
  onApply: (pattern: string, projectId: string | null) => void;
}) {
  const [pattern, setPattern] = useState("");
  const [projectId, setProjectId] = useState("");
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg pl-2 pr-1 py-0.5">
      <span className="text-[11px] text-slate-500">Projekt-Bulk:</span>
      <input
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder="Suchwort (z. B. RYLA)"
        className="text-xs px-1.5 py-1 outline-none w-32 bg-transparent"
      />
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="text-xs px-1 py-1 outline-none bg-transparent"
      >
        <option value="">— Projekt —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onApply(pattern, projectId || null)}
        disabled={!pattern.trim()}
        className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
      >
        Anwenden
      </button>
    </div>
  );
}
