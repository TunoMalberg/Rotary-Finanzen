"use client";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { Loader2, Upload, CheckCircle2, AlertTriangle, Plus, Trash2, FileSearch } from "lucide-react";
import { formatEUR } from "@/lib/format";

type ReconcileResult = {
  fileSource: "csv" | "xlsx";
  bankRowsTotal: number;
  bankRowsInYear: number;
  dbRows: number;
  matched: number;
  matchByRef: number;
  missingInDb: Array<{
    date: string;
    counterparty: string | null;
    purpose: string | null;
    amount: number;
    externalRef: string | null;
    partnerIban: string | null;
    valueDate: string | null;
  }>;
  surplusInDb: Array<{
    id: string;
    date: string;
    counterparty: string | null;
    purpose: string | null;
    amount: number;
    externalRef: string | null;
    sourceType: string;
  }>;
  opening: number;
  bankSum: number;
  dbSum: number;
  bankClosing: number;
  dbClosing: number;
  diff: number;
};

export function ReconcileTool({
  accounts,
  clubYears,
  defaultAccountId,
  defaultClubYearId,
  closingByYearAccount,
  accountTypeById,
}: {
  accounts: { id: string; name: string; type: string; iban: string | null }[];
  clubYears: { id: string; label: string }[];
  defaultAccountId?: string;
  defaultClubYearId?: string;
  /** Map "<yearId>|MAIN" / "<yearId>|GG" → computed closing balance from audit */
  closingByYearAccount: Record<string, number>;
  /** Map accountId → "MAIN" | "GLOBAL_GRANT_TRUST" */
  accountTypeById: Record<string, string>;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id);
  const [clubYearId, setClubYearId] = useState(defaultClubYearId ?? clubYears[0]?.id);
  const [bankClosingInput, setBankClosingInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const [selMissing, setSelMissing] = useState<Set<number>>(new Set());
  const [selSurplus, setSelSurplus] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  // Soll-Ist-Diff (sofort, ohne Datei)
  const expectedClosing = useMemo(() => {
    const v = bankClosingInput.replace(/\s|\./g, "").replace(",", ".");
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }, [bankClosingInput]);

  async function run() {
    if (!file) {
      setError("Bitte eine Bank-Datei auswählen (CSV oder XLSX).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSelMissing(new Set());
    setSelSurplus(new Set());
    setApplyMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId);
    fd.append("clubYearId", clubYearId);
    try {
      const res = await fetch("/api/accounts/reconcile", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
      } else {
        const j: ReconcileResult = await res.json();
        setResult(j);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function applyChanges() {
    if (!result) return;
    setApplying(true);
    setApplyMessage(null);
    try {
      const addRows = [...selMissing].map((idx) => result.missingInDb[idx]);
      const deleteIds = [...selSurplus];
      const res = await fetch("/api/accounts/reconcile/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, clubYearId, addRows, deleteIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setApplyMessage(`Fehler: ${j.error ?? res.status}`);
        return;
      }
      const j = await res.json();
      setApplyMessage(`Übernommen: ${j.created} angelegt, ${j.deleted} gelöscht.`);
      setResult(null);
      setSelMissing(new Set());
      setSelSurplus(new Set());
      router.refresh();
    } catch (e) {
      setApplyMessage(e instanceof Error ? e.message : "Fehler");
    } finally {
      setApplying(false);
    }
  }

  // Sofortige Soll-Ist-Diff anhand des Audits (ohne Datei-Upload):
  const auditKey = `${clubYearId}|${accountTypeById[accountId] === "MAIN" ? "MAIN" : "GG"}`;
  const auditClosing = closingByYearAccount[auditKey] ?? null;
  const dbClosing = result?.dbClosing ?? auditClosing;
  const sollIstDiff =
    dbClosing !== null && expectedClosing !== null ? dbClosing - expectedClosing : null;

  return (
    <div className="space-y-5">
      {/* Soll-Ist-Saldo (Schnellprüfung) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Konto</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type === "MAIN" ? "Hauptkonto" : "Global Grant"})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Clubjahr</label>
          <select className="input" value={clubYearId} onChange={(e) => setClubYearId(e.target.value)}>
            {clubYears.map((y) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">
            Bank-Endsaldo laut George (€)
          </label>
          <input
            className="input font-mono"
            placeholder="z. B. 54.263,16"
            value={bankClosingInput}
            onChange={(e) => setBankClosingInput(e.target.value)}
          />
          <div className="text-[11px] text-slate-500 mt-1">
            App-Endsaldo:{" "}
            <span className="font-mono font-semibold text-slate-700">
              {auditClosing != null ? formatEUR(auditClosing) : "—"}
            </span>
          </div>
          {sollIstDiff !== null && (
            <div
              className={`text-xs mt-1 font-semibold ${Math.abs(sollIstDiff) < 0.01 ? "text-emerald-700" : "text-rose-700"}`}
            >
              {Math.abs(sollIstDiff) < 0.01 ? (
                <>✓ Übereinstimmung</>
              ) : (
                <>Δ App − Bank: {formatEUR(sollIstDiff)}</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File upload */}
      <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 sm:p-5 bg-slate-50/50">
        <label className="text-xs font-semibold text-slate-700 mb-1 block">
          George-Datei hochladen (Vollvergleich)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            onClick={run}
            className="btn-primary"
            disabled={loading || !file}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
            Vergleich starten
          </button>
        </div>
        {error && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3 mt-3">
            {error}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Zeilen Datei" value={String(result.bankRowsInYear)} sub={`${result.bankRowsTotal} insg.`} />
            <Stat label="Buchungen DB" value={String(result.dbRows)} sub={`${result.matched} matched`} />
            <Stat
              label="Bank-Endsaldo (lt. Datei)"
              value={formatEUR(result.bankClosing)}
              sub={`Σ ${formatEUR(result.bankSum)}`}
            />
            <Stat
              label="DB-Endsaldo (App)"
              value={formatEUR(result.dbClosing)}
              sub={`Σ ${formatEUR(result.dbSum)}`}
            />
          </div>

          <div
            className={`rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 ${
              Math.abs(result.diff) < 0.01
                ? "bg-emerald-50 border border-emerald-200"
                : "bg-rose-50 border border-rose-200"
            }`}
          >
            <div className="flex items-center gap-3">
              {Math.abs(result.diff) < 0.01 ? (
                <CheckCircle2 className="size-6 text-emerald-700" />
              ) : (
                <AlertTriangle className="size-6 text-rose-700" />
              )}
              <div>
                <div className="font-semibold">
                  Differenz App − Bank: {formatEUR(result.diff)}
                </div>
                <div className="text-xs text-slate-600">
                  Anfangssaldo {formatEUR(result.opening)} · Bank Σ {formatEUR(result.bankSum)} · DB Σ {formatEUR(result.dbSum)}
                </div>
              </div>
            </div>
            {result.matchByRef > 0 && (
              <div className="text-xs text-slate-500">
                {result.matchByRef} Treffer per Buchungsreferenz
              </div>
            )}
          </div>

          {applyMessage && (
            <div className="rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-sm p-3">
              {applyMessage}
            </div>
          )}

          {/* Missing in DB */}
          <div className="card-soft overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Plus className="size-4 text-emerald-700" />
                In Bank-Datei, aber nicht in DB ({result.missingInDb.length})
              </h3>
              {result.missingInDb.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() =>
                    setSelMissing(
                      selMissing.size === result.missingInDb.length
                        ? new Set()
                        : new Set(result.missingInDb.map((_, i) => i)),
                    )
                  }
                >
                  {selMissing.size === result.missingInDb.length ? "Keine" : "Alle"} auswählen
                </button>
              )}
            </div>
            {result.missingInDb.length === 0 ? (
              <div className="p-5 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="size-4" /> Alle Bank-Zeilen sind in der DB.
              </div>
            ) : (
              <div className="table-scroll max-h-[420px]">
                <table className="data-table">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="w-8" />
                      <th>Datum</th>
                      <th>Gegenpartei</th>
                      <th>Verwendungszweck</th>
                      <th className="text-right">Betrag</th>
                      <th>Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.missingInDb.map((r, i) => {
                      const sel = selMissing.has(i);
                      return (
                        <tr
                          key={i}
                          className={sel ? "bg-emerald-50" : ""}
                          onClick={() => {
                            const n = new Set(selMissing);
                            if (n.has(i)) n.delete(i);
                            else n.add(i);
                            setSelMissing(n);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={(e) => {
                                e.stopPropagation();
                                const n = new Set(selMissing);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                setSelMissing(n);
                              }}
                            />
                          </td>
                          <td className="whitespace-nowrap">{r.date}</td>
                          <td className="font-medium">{r.counterparty ?? "—"}</td>
                          <td className="text-slate-600 max-w-[320px] truncate">{r.purpose ?? "—"}</td>
                          <td className={`text-right font-mono tabular ${r.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                            {formatEUR(r.amount)}
                          </td>
                          <td className="text-xs font-mono text-slate-500">
                            {r.externalRef ? r.externalRef.slice(-12) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="font-semibold no-stack-label">Summe fehlend</td>
                      <td className="text-right font-mono tabular font-semibold">
                        {formatEUR(
                          result.missingInDb.reduce((s, r) => s + r.amount, 0),
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Surplus in DB */}
          <div className="card-soft overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Trash2 className="size-4 text-rose-700" />
                In DB, aber nicht in Bank-Datei ({result.surplusInDb.length})
              </h3>
              {result.surplusInDb.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() =>
                    setSelSurplus(
                      selSurplus.size === result.surplusInDb.length
                        ? new Set()
                        : new Set(result.surplusInDb.map((r) => r.id)),
                    )
                  }
                >
                  {selSurplus.size === result.surplusInDb.length ? "Keine" : "Alle"} auswählen
                </button>
              )}
            </div>
            {result.surplusInDb.length === 0 ? (
              <div className="p-5 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="size-4" /> Keine überschüssigen DB-Buchungen.
              </div>
            ) : (
              <div className="table-scroll max-h-[420px]">
                <table className="data-table">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="w-8" />
                      <th>Datum</th>
                      <th>Gegenpartei</th>
                      <th>Verwendungszweck</th>
                      <th className="text-right">Betrag</th>
                      <th>Quelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.surplusInDb.map((r) => {
                      const sel = selSurplus.has(r.id);
                      return (
                        <tr
                          key={r.id}
                          className={sel ? "bg-rose-50" : ""}
                          onClick={() => {
                            const n = new Set(selSurplus);
                            if (n.has(r.id)) n.delete(r.id);
                            else n.add(r.id);
                            setSelSurplus(n);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={(e) => {
                                e.stopPropagation();
                                const n = new Set(selSurplus);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                setSelSurplus(n);
                              }}
                            />
                          </td>
                          <td className="whitespace-nowrap">{r.date}</td>
                          <td className="font-medium">{r.counterparty ?? "—"}</td>
                          <td className="text-slate-600 max-w-[320px] truncate">{r.purpose ?? "—"}</td>
                          <td className={`text-right font-mono tabular ${r.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                            {formatEUR(r.amount)}
                          </td>
                          <td className="text-xs">
                            <span className={`chip ${r.externalRef ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                              {r.externalRef ? "Bank-Import" : r.sourceType}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="font-semibold no-stack-label">Summe überschüssig</td>
                      <td className="text-right font-mono tabular font-semibold">
                        {formatEUR(
                          result.surplusInDb.reduce((s, r) => s + r.amount, 0),
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {(selMissing.size > 0 || selSurplus.size > 0) && (
            <div className="sticky bottom-2 z-10 rounded-xl bg-white border border-slate-200 shadow-lg p-3 flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-slate-700">
                {selMissing.size > 0 && (
                  <span>
                    <Plus className="inline size-3.5 text-emerald-700 mr-1" />
                    {selMissing.size} fehlende Buchung(en) anlegen
                  </span>
                )}
                {selMissing.size > 0 && selSurplus.size > 0 && <span> · </span>}
                {selSurplus.size > 0 && (
                  <span>
                    <Trash2 className="inline size-3.5 text-rose-700 mr-1" />
                    {selSurplus.size} überschüssige löschen
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={applyChanges}
                disabled={applying}
                className="btn-primary"
              >
                {applying ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Übernehmen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold tabular text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}