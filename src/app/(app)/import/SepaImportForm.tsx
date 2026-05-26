"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Info,
} from "lucide-react";
import { formatDate, formatEUR } from "@/lib/format";

type PreviewEntry = {
  partnerName: string;
  lastName: string;
  amount: number;
  partnerIban: string | null;
  info: string | null;
  member: { id: string; name: string } | null;
  invoice: { id: string; reference: string; status: string; amount: number } | null;
  matchType: "iban" | "name" | "name-ambiguous" | "none";
  note: string | null;
};

type PreviewResp = {
  dryRun: boolean;
  settledInvoices?: boolean;
  parsed: {
    collectionName: string | null;
    collectionRef: string | null;
    expectedCount: number | null;
    totalAmount: number | null;
    executionDate: string | null;
    dueDate: string | null;
  };
  aggregateTransaction: {
    id: string;
    date: string;
    amount: number;
    purpose: string | null;
  };
  stats: {
    totalEntries: number;
    memberMatched: number;
    unmatchedMembers: number;
    invoiceMatched: number;
    unmatchedInvoices: number;
    sum: number;
  };
  preview: PreviewEntry[];
};

export function SepaImportForm({
  accounts,
}: {
  accounts: { id: string; name: string; type: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.type === "MAIN")?.id ?? accounts[0]?.id,
  );
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const visible = useMemo(() => {
    if (!preview) return [] as PreviewEntry[];
    if (filter === "all") return preview.preview;
    if (filter === "matched")
      return preview.preview.filter((e) => e.invoice && e.member);
    return preview.preview.filter((e) => !e.invoice || !e.member);
  }, [preview, filter]);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId ?? "");
    fd.append("dryRun", dryRun ? "true" : "false");
    const res = await fetch("/api/import/sepa", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "SEPA-Import fehlgeschlagen.");
      return;
    }
    const data = (await res.json()) as PreviewResp;
    setPreview(data);
    if (!dryRun) {
      setDone(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-3 sm:p-6 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">
            Konto (Sammelbuchung wird automatisch ermittelt)
          </label>
          <select
            className="input"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">
            SEPA-Sammeleinzug-PDF
          </label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              <FileText className="size-3.5" /> {file.name} ·{" "}
              {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>
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
            className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 flex items-start gap-2"
          >
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Aufteilungen gespeichert.</div>
              <div className="text-xs mt-0.5">
                Die Sammelbuchung wurde in {preview?.stats.totalEntries ?? 0}{" "}
                Einzelbuchungen aufgeteilt. Forderungen sind weiterhin als{" "}
                <em>offen</em> markiert – auf der Buchungs-Detailseite mit{" "}
                <strong>„Einzüge vornehmen"</strong> als beglichen markieren.
              </div>
              {preview?.aggregateTransaction.id && (
                <a
                  href={`/transactions/${preview.aggregateTransaction.id}`}
                  className="text-xs text-emerald-700 underline mt-1 inline-block"
                >
                  → Sammelbuchung öffnen
                </a>
              )}
            </div>
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
            disabled={!file || busy}
            onClick={() => run(false)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}{" "}
            Sammelbuchung aufteilen
          </button>
        </div>
      </div>

      {preview && (
        <div className="card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b space-y-2">
            <div className="text-sm">
              <div>
                Sammlung:{" "}
                <span className="font-mono font-semibold">
                  {preview.parsed.collectionName ?? "—"}
                </span>{" "}
                ·{" "}
                <span className="font-semibold">
                  {preview.parsed.expectedCount ?? preview.stats.totalEntries}
                </span>{" "}
                Aufträge ·{" "}
                <span className="font-semibold">
                  {preview.parsed.totalAmount != null
                    ? formatEUR(preview.parsed.totalAmount)
                    : "—"}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                Aggregat-Buchung: {formatDate(preview.aggregateTransaction.date)} ·{" "}
                {formatEUR(preview.aggregateTransaction.amount)} ·{" "}
                <span className="text-slate-500">
                  {preview.aggregateTransaction.purpose ?? "—"}
                </span>
              </div>
              <div className="text-xs mt-1">
                <span className="font-semibold text-emerald-700">
                  {preview.stats.memberMatched} Mitglieder erkannt
                </span>{" "}
                ·{" "}
                <span className="font-semibold text-blue-700">
                  {preview.stats.invoiceMatched} offene Forderungen verknüpfbar
                </span>
                {preview.stats.unmatchedInvoices > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-amber-700">
                      {preview.stats.unmatchedInvoices} ohne offene Forderung
                    </span>
                  </>
                )}
                {preview.stats.unmatchedMembers > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-red-700">
                      {preview.stats.unmatchedMembers} Mitglied unbekannt
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="text-xs flex items-start gap-2 text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2">
              <Info className="size-3.5 shrink-0 mt-0.5 text-blue-600" />
              <div>
                Beim Bestätigen wird für jeden Eintrag eine{" "}
                <strong>Aufteilung</strong> auf die Aggregat-Buchung angelegt
                (sichtbar als Einzelbuchung). Forderungen bleiben{" "}
                <em>offen</em>; die endgültige Begleichung erfolgt manuell auf
                der Buchungs-Detailseite über{" "}
                <strong>„Einzüge vornehmen"</strong>.
              </div>
            </div>

            <div className="flex flex-wrap gap-1 text-xs" role="tablist">
              {(
                [
                  { k: "all", label: `Alle (${preview.preview.length})` },
                  {
                    k: "matched",
                    label: `Forderung verknüpft (${preview.stats.invoiceMatched})`,
                  },
                  {
                    k: "unmatched",
                    label: `Offen / Mitglied fehlt (${preview.stats.unmatchedInvoices + preview.stats.unmatchedMembers})`,
                  },
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

          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll max-h-[480px]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Mitglied</th>
                    <th>IBAN</th>
                    <th>Forderung</th>
                    <th>Status</th>
                    <th className="text-right">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e, i) => (
                    <tr
                      key={i}
                      className={
                        !e.member
                          ? "danger"
                          : !e.invoice
                            ? "muted"
                            : ""
                      }
                    >
                      <td data-label="Partner" className="font-medium">
                        {e.partnerName}
                      </td>
                      <td data-label="Mitglied" className="text-slate-700">
                        {e.member ? (
                          <>
                            {e.member.name}
                            {e.matchType === "name-ambiguous" && (
                              <span className="ml-1 text-amber-700 text-xs">
                                ⚠ mehrdeutig
                              </span>
                            )}
                            {e.matchType === "iban" && (
                              <span className="ml-1 text-emerald-700 text-xs">
                                IBAN
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-red-700">— unbekannt —</span>
                        )}
                      </td>
                      <td data-label="IBAN" className="font-mono text-xs text-slate-500">
                        {e.partnerIban ?? "—"}
                      </td>
                      <td data-label="Forderung" className="text-xs">
                        {e.invoice ? (
                          <>
                            <code>{e.invoice.reference}</code>{" "}
                            <span className="text-slate-500">
                              ({e.invoice.status})
                            </span>
                          </>
                        ) : e.member ? (
                          <span className="text-amber-700">keine offene</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Status">
                        {e.invoice ? (
                          <span className="chip chip-active">
                            verknüpfbar
                          </span>
                        ) : e.member ? (
                          <span
                            className="chip"
                            style={{ background: "#FEF3C7", color: "#92400E" }}
                          >
                            nur Aufteilung
                          </span>
                        ) : (
                          <span className="chip chip-cancelled">
                            nicht zuordenbar
                          </span>
                        )}
                      </td>
                      <td
                        data-label="Betrag"
                        className="text-right font-mono tabular amount-pos"
                      >
                        {formatEUR(e.amount)}
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-sm text-slate-500 py-6">
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
    </div>
  );
}