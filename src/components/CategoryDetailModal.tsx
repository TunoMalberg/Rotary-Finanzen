"use client";
import { formatDate, formatEUR } from "@/lib/format";
import { ExternalLink, Loader2, Receipt, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  date: string;
  counterparty: string | null;
  purpose: string | null;
  amount: number;
  account: { name: string; type: string } | null;
  project: { code: string; name: string; color: string } | null;
  category: { name: string; color: string; kind: string } | null;
};

type Payload = {
  year: string;
  category: string;
  total: number;
  items: Item[];
};

export function CategoryDetailModal({
  open,
  onClose,
  year,
  category,
  kind,
  color,
}: {
  open: boolean;
  onClose: () => void;
  year: string | null;
  category: string | null;
  kind: "INCOME" | "EXPENSE";
  color?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !year || !category) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    const url = `/api/reports/details?year=${encodeURIComponent(year)}&category=${encodeURIComponent(category)}&kind=${kind}`;
    fetch(url)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((json: Payload) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, year, category, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const items = data?.items ?? [];
  const totalAbs = Math.abs(data?.total ?? 0);
  const tone = kind === "INCOME" ? "amount-pos" : "amount-neg";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />
      <div className="relative bg-white w-full sm:max-w-4xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div
          className="px-5 py-4 border-b flex items-start gap-3"
          style={{
            background: color
              ? `linear-gradient(90deg, ${color}14, transparent)`
              : undefined,
          }}
        >
          <span
            className="inline-flex size-9 items-center justify-center rounded-lg shrink-0"
            style={{
              background: `${color ?? "#17458F"}1A`,
              color: color ?? "#17458F",
            }}
          >
            <Receipt className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Sammelbetrag · {year}
            </div>
            <div className="text-lg font-bold truncate">{category}</div>
            <div className="text-xs text-slate-500">
              {kind === "INCOME" ? "Einnahmen" : "Ausgaben"} · {items.length}{" "}
              {items.length === 1 ? "Buchung" : "Buchungen"} · Summe{" "}
              <span className={`font-mono font-semibold ${tone}`}>
                {formatEUR(totalAbs)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
              <Loader2 className="size-4 animate-spin" /> Lade Buchungen…
            </div>
          )}
          {error && (
            <div className="m-4 rounded-lg bg-rose-50 text-rose-700 px-4 py-3 text-sm">
              Fehler: {error}
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="py-16 text-center text-slate-500 text-sm">
              Keine Buchungen für diese Kategorie in diesem Clubjahr.
            </div>
          )}
          {!loading && items.length > 0 && (
            <table className="data-table">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb]">
                <tr>
                  <th className="whitespace-nowrap">Datum</th>
                  <th>Empfänger / Zahler</th>
                  <th>Verwendungszweck</th>
                  <th>Konto</th>
                  <th>Projekt</th>
                  <th className="text-right whitespace-nowrap">Betrag</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="whitespace-nowrap text-slate-600">
                      {formatDate(it.date)}
                    </td>
                    <td className="font-medium">{it.counterparty ?? "—"}</td>
                    <td
                      className="text-slate-600 max-w-[28ch] truncate"
                      title={it.purpose ?? ""}
                    >
                      {it.purpose ?? "—"}
                    </td>
                    <td className="text-slate-600 whitespace-nowrap">
                      {it.account?.name ?? "—"}
                    </td>
                    <td>
                      {it.project ? (
                        <span
                          className="chip"
                          style={{
                            background: `${it.project.color}1A`,
                            color: it.project.color,
                          }}
                        >
                          {it.project.code}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className={`text-right font-mono tabular whitespace-nowrap ${
                        it.amount >= 0 ? "amount-pos" : "amount-neg"
                      }`}
                    >
                      {formatEUR(it.amount)}
                    </td>
                    <td>
                      <Link
                        href={`/transactions/${it.id}`}
                        className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-800"
                        title="Buchung öffnen"
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={5} className="text-right">
                    Summe
                  </td>
                  <td className={`text-right font-mono tabular ${tone}`}>
                    {formatEUR(totalAbs)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white border text-sm font-semibold hover:bg-slate-100"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
