"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Paperclip, Loader2, X, Search, ExternalLink } from "lucide-react";

type Row = {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  extractedAmount: number | null;
  extractedIban: string | null;
  extractedInvNo: string | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  candidates: {
    transactionId: string;
    score: number;
    reasons: string[];
    label: string;
  }[];
};

export function InboxTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchOpenFor, setSearchOpenFor] = useState<string | null>(null);

  async function assign(mailId: string, transactionId: string) {
    setBusyId(mailId);
    setError(null);
    try {
      const res = await fetch(`/api/mail-inbox/${mailId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Zuordnung fehlgeschlagen.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler.");
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(mailId: string) {
    if (!confirm("Mail aus der Inbox entfernen (kein Beleg, keine Zuordnung)?"))
      return;
    setBusyId(mailId);
    try {
      await fetch(`/api/mail-inbox/${mailId}/dismiss`, { method: "POST" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-2">
          {error}
        </div>
      )}
      {rows.map((r) => (
        <div key={r.id} className="card-soft overflow-hidden">
          <div className="px-4 py-3 border-b flex items-start gap-3">
            <Mail className="size-5 text-slate-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.from}</div>
              <div className="text-sm text-slate-700 truncate">{r.subject}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {new Date(r.receivedAt).toLocaleString("de-AT")}
                {r.extractedAmount != null && (
                  <>
                    {" · "}
                    <strong>
                      {r.extractedAmount.toLocaleString("de-AT", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      €
                    </strong>
                  </>
                )}
                {r.extractedInvNo && <> · Rg-Nr {r.extractedInvNo}</>}
                {r.extractedIban && (
                  <> · <span className="font-mono">{r.extractedIban}</span></>
                )}
              </div>
              {r.attachments.length > 0 && (
                <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {r.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 hover:underline text-blue-800"
                    >
                      <Paperclip className="size-3" />
                      {a.fileName}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(r.id)}
              className="btn-ghost text-xs"
              title="Verwerfen"
              disabled={busyId === r.id}
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Vorschläge:
            </div>
            {r.candidates.length === 0 ? (
              <div className="text-xs text-slate-500">
                Keine passenden Buchungen gefunden.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {r.candidates.map((c) => (
                  <li
                    key={c.transactionId}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span
                      className={`text-xs font-mono mt-0.5 px-1.5 py-0.5 rounded ${
                        c.score >= 0.7
                          ? "bg-emerald-100 text-emerald-800"
                          : c.score >= 0.4
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {Math.round(c.score * 100)}%
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{c.label}</div>
                      <div className="text-xs text-slate-500">
                        {c.reasons.join(" · ") || "schwacher Treffer"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => assign(r.id, c.transactionId)}
                      disabled={busyId === r.id}
                      className="btn-primary text-xs"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : null}
                      Zuordnen
                    </button>
                    <a
                      href={`/transactions/${c.transactionId}`}
                      target="_blank"
                      rel="noopener"
                      className="btn-ghost text-xs"
                      title="Buchung öffnen"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-xs">
              <button
                type="button"
                onClick={() =>
                  setSearchOpenFor(searchOpenFor === r.id ? null : r.id)
                }
                className="text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                <Search className="size-3" /> andere Buchung suchen…
              </button>
              {searchOpenFor === r.id && (
                <ManualSearch
                  onPick={(txId) => assign(r.id, txId)}
                  initialAmount={r.extractedAmount}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ManualSearch({
  onPick,
  initialAmount,
}: {
  onPick: (transactionId: string) => void;
  initialAmount: number | null;
}) {
  const [q, setQ] = useState(
    initialAmount != null ? initialAmount.toFixed(2) : "",
  );
  const [results, setResults] = useState<
    | {
        id: string;
        date: string;
        amount: number;
        counterparty: string | null;
        purpose: string | null;
      }[]
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    const res = await fetch(`/api/transactions/search?q=${encodeURIComponent(q)}`);
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setResults(data.results ?? []);
    }
  }

  return (
    <div className="mt-2 border rounded p-2 bg-slate-50">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Betrag, Gegenpartei oder Verwendungszweck"
        />
        <button
          type="button"
          onClick={search}
          disabled={!q || busy}
          className="btn-ghost text-xs"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
        </button>
      </div>
      {results && results.length === 0 && (
        <div className="text-xs text-slate-500 mt-2">Keine Treffer.</div>
      )}
      {results && results.length > 0 && (
        <ul className="mt-2 space-y-1 max-h-60 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate">
                {new Date(r.date).toLocaleDateString("de-AT")} ·{" "}
                {r.amount.toLocaleString("de-AT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                € ·{" "}
                {r.counterparty ?? r.purpose ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => onPick(r.id)}
                className="btn-primary text-xs"
              >
                Zuordnen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}