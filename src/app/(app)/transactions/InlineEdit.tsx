"use client";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Inline-Edit Text-Feld (Single-Line).
 * - Klick → input öffnet sich, autofocus.
 * - Enter / Blur → speichert.
 * - Escape → verwirft.
 * - Während des Speicherns Spinner; bei Fehler rote Border + tooltip.
 */
export function InlineText({
  value,
  placeholder,
  onCommit,
  emptyLabel = "—",
  className,
}: {
  value: string | null;
  placeholder?: string;
  onCommit: (next: string | null) => Promise<void>;
  emptyLabel?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const next = draft.trim() === "" ? null : draft;
    if ((next ?? "") === (value ?? "")) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onCommit(next);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
    setErr(null);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`group/inline relative w-full text-left px-1 py-0.5 rounded hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${className ?? ""}`}
        title="Klicken zum Bearbeiten"
      >
        <span className={value ? "" : "text-slate-400"}>{value ?? emptyLabel}</span>
        <Pencil className="size-3 text-slate-300 group-hover/inline:text-blue-500 absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/inline:opacity-100 transition" />
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${err ? "ring-2 ring-red-300 rounded" : ""}`} title={err ?? undefined}>
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        disabled={busy}
        className="input !py-1 !px-2 text-sm w-full"
      />
      {busy && <Loader2 className="size-3.5 animate-spin text-blue-700 shrink-0" />}
      {!busy && err && (
        <button type="button" onClick={cancel} className="text-red-600 hover:text-red-700 shrink-0" aria-label="Abbrechen">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Inline-Edit Pulldown.
 * - Direkt offen, speichert beim onChange.
 * - Optional erste Option (z. B. „— ohne —") mit Wert "" → null.
 */
export function InlineSelect<T extends string>({
  value,
  options,
  onCommit,
  placeholder,
  className,
}: {
  value: T | null;
  options: { value: T; label: string; color?: string }[];
  onCommit: (next: T | null) => Promise<void>;
  placeholder?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value;
    const next = raw === "" ? null : (raw as T);
    if (next === value) return;
    setBusy(true);
    setErr(null);
    try {
      await onCommit(next);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const current = options.find((o) => o.value === value);

  return (
    <div className={`flex items-center gap-1 ${err ? "ring-2 ring-red-300 rounded" : ""} ${className ?? ""}`} title={err ?? undefined}>
      <select
        value={value ?? ""}
        onChange={handleChange}
        disabled={busy}
        className="input !py-1 !px-2 text-sm w-full"
        style={
          current?.color
            ? { borderLeftColor: current.color, borderLeftWidth: 3 }
            : undefined
        }
      >
        <option value="">{placeholder ?? "— ohne —"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {busy && <Loader2 className="size-3.5 animate-spin text-blue-700 shrink-0" />}
    </div>
  );
}