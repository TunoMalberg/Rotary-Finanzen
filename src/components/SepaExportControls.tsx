"use client";
import { useState } from "react";
import {
  Landmark,
  Loader2,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { formatEUR } from "@/lib/format";

type ClubYear = { id: string; label: string };

type PreviewResult = {
  clubYearLabel: string;
  count: number;
  totalAmount: number;
  missingIban: { name: string; reference: string }[];
  settingsOk: boolean;
};

/**
 * Selbst-enthaltener Bereich zum Erzeugen der SEPA-Sammellastschrift
 * (George Business CSV): Fälligkeitsdatum wählen, Vorschau anzeigen
 * (Anzahl / Summe / fehlende IBANs) und anschließend die CSV herunterladen.
 *
 * Wird sowohl auf der Beiträge-Seite (ein Clubjahr) als auch auf der
 * SEPA-Einstellungsseite (mit Clubjahr-Auswahl) verwendet.
 */
export function SepaExportControls({
  initialClubYearId,
  clubYears,
}: {
  initialClubYearId: string;
  clubYears?: ClubYear[];
}) {
  const [open, setOpen] = useState(false);
  const [clubYearId, setClubYearId] = useState(initialClubYearId);
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "download" | "downloadXml">(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showSelect = (clubYears?.length ?? 0) > 1;

  function buildQuery(includePreview: boolean, format?: "csv" | "xml") {
    const p = new URLSearchParams({ clubYearId });
    if (faelligkeitsdatum) p.set("faelligkeitsdatum", faelligkeitsdatum);
    if (includePreview) p.set("preview", "1");
    if (format === "xml") p.set("format", "xml");
    return p.toString();
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/sepa/export?${buildQuery(true)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `Fehler ${res.status}`);
      }
      setPreview(data as PreviewResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  }

  async function runDownload(format: "csv" | "xml") {
    setBusy(format === "xml" ? "downloadXml" : "download");
    setError(null);
    try {
      const res = await fetch(`/api/sepa/export?${buildQuery(false, format)}`, {
        cache: "no-store",
      });
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
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename =
        match?.[1] ??
        `SEPA-Einzug_${new Date().toISOString().slice(0, 10)}.${format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="SEPA-Sammellastschrift als George-CSV erzeugen"
      >
        <Landmark className="size-4" /> SEPA-Einzug (George CSV)
      </button>

      {open && (
        <div className="mt-3 card-soft p-4 space-y-4 w-full sm:w-[28rem] text-left">
          <div className="grid grid-cols-1 gap-3">
            {showSelect && (
              <div>
                <label className="text-xs font-semibold mb-1 block">
                  Clubjahr
                </label>
                <select
                  className="input"
                  value={clubYearId}
                  onChange={(e) => {
                    setClubYearId(e.target.value);
                    setPreview(null);
                  }}
                >
                  {clubYears?.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                Fälligkeitsdatum (optional)
              </label>
              <input
                type="date"
                className="input"
                value={faelligkeitsdatum}
                onChange={(e) => setFaelligkeitsdatum(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">
                Datum, zu dem die Beträge eingezogen werden sollen. Leer lassen,
                um es in George selbst zu setzen.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={runPreview}
              disabled={busy !== null}
            >
              {busy === "preview" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}{" "}
              Vorschau
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => runDownload("csv")}
              disabled={busy !== null}
            >
              {busy === "download" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}{" "}
              CSV herunterladen
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => runDownload("xml")}
              disabled={busy !== null}
              title="SEPA-XML (pain.008) für den Datei-/Datenträger-Upload"
            >
              {busy === "downloadXml" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}{" "}
              XML (pain.008)
            </button>
          </div>
          <p className="text-xs text-slate-400">
            CSV: über die <strong>CSV-Import</strong>-Funktion in George hochladen.
            XML (pain.008): über <strong>Datei-/Datenträger-Import</strong> — dafür
            sind Fälligkeitsdatum und Gläubiger-Name nötig.
          </p>

          {error && (
            <p className="flex items-start gap-2 text-sm text-red-600">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          {preview && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="size-4" />
                <span>
                  Clubjahr {preview.clubYearLabel || "—"}:{" "}
                  <strong>{preview.count}</strong> Einzüge über{" "}
                  <strong>{formatEUR(preview.totalAmount)}</strong>
                </span>
              </div>
              {preview.missingIban.length > 0 ? (
                <div className="text-amber-700">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4" />
                    {preview.missingIban.length} ohne IBAN (werden
                    ausgelassen):
                  </div>
                  <ul className="list-disc list-inside mt-1 text-xs text-slate-600">
                    {preview.missingIban.map((m) => (
                      <li key={m.reference}>
                        {m.name}{" "}
                        <span className="font-mono text-slate-400">
                          ({m.reference})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Alle SEPA-Zahler haben eine IBAN hinterlegt.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
