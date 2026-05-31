"use client";

import { FileSpreadsheet, FileText, Presentation, Loader2, Download, Sparkles } from "lucide-react";
import { useState } from "react";

type Format = "pdf" | "pptx" | "xlsx";

export function TreasurerReportPanel({
  clubYearId,
  clubYearLabel,
  isInterim,
}: {
  clubYearId: string;
  clubYearLabel: string;
  isInterim: boolean;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: Format) {
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/treasurer?format=${format}&year=${encodeURIComponent(clubYearId)}`,
        { method: "GET", cache: "no-store" },
      );
      if (!res.ok) {
        let msg = `Download fehlgeschlagen (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^";]+)"?/i.exec(cd);
      const filename =
        m?.[1] ??
        `RC-Wien-Donau_${isInterim ? "Zwischenabschluss" : "Jahresabschluss"}_${clubYearLabel}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card-soft overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-blue-700" />
          <h3 className="font-semibold">
            Schatzmeister-{isInterim ? "Zwischenabschluss" : "Jahresabschluss"}
          </h3>
        </div>
        <span className="text-xs text-slate-500">
          Clubjahr {clubYearLabel} · Vorstandsbericht
        </span>
      </div>
      <div className="p-4 sm:p-5 space-y-3">
        <p className="text-sm text-slate-600">
          Erzeugt einen vollständigen Bericht für den Vorstand inklusive
          Buchungsliste, Soll/Ist-Vergleich, Clubprojekten, offenen
          Mitgliedsbeiträgen und Auslagenbericht – mit Texten, Tabellen und
          Charts.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ReportButton
            icon={<FileText className="size-5" />}
            color="rose"
            title="PDF"
            subtitle="Druckfertig, alle Tabellen + Bar-Chart"
            busy={busy === "pdf"}
            disabled={!!busy}
            onClick={() => download("pdf")}
          />
          <ReportButton
            icon={<Presentation className="size-5" />}
            color="amber"
            title="PowerPoint"
            subtitle="9 Folien, native Charts (16:9)"
            busy={busy === "pptx"}
            disabled={!!busy}
            onClick={() => download("pptx")}
          />
          <ReportButton
            icon={<FileSpreadsheet className="size-5" />}
            color="emerald"
            title="Excel"
            subtitle="7 Sheets, Filter + Formate"
            busy={busy === "xlsx"}
            disabled={!!busy}
            onClick={() => download("xlsx")}
          />
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3" role="alert">
            {error}
          </div>
        )}

        <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <span>Inhalt:</span>
          <span>· Executive Summary (KPIs)</span>
          <span>· Soll/Ist mit Chart</span>
          <span>· Buchungsliste komplett</span>
          <span>· Clubprojekte mit Saldo</span>
          <span>· Offene Forderungen + Auslagen</span>
        </div>
      </div>
    </div>
  );
}

function ReportButton({
  icon,
  title,
  subtitle,
  color,
  busy,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: "rose" | "amber" | "emerald";
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const styles = {
    rose: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", btn: "bg-rose-600 hover:bg-rose-700" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700" },
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-start gap-3 rounded-lg border ${styles.border} ${styles.bg} p-3 text-left transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none`}
    >
      <span className={`shrink-0 grid place-items-center size-9 rounded-md ${styles.btn} text-white`}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block font-semibold ${styles.text}`}>{title}</span>
        <span className="block text-xs text-slate-600 truncate">{subtitle}</span>
      </span>
      <Download className="size-4 text-slate-400 group-hover:text-slate-600 shrink-0 mt-1" />
    </button>
  );
}