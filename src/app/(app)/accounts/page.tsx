import { auditAccountBalances } from "@/lib/balanceAudit";
import { formatDate, formatEUR } from "@/lib/format";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { Wallet, AlertTriangle, CheckCircle2, ArrowRight, Settings2, ScanSearch } from "lucide-react";
import Link from "next/link";
import { OpeningBalanceEditor } from "./OpeningBalanceEditor";
import { DuplicateResolver } from "./DuplicateResolver";
import { ReconcileTool } from "./ReconcileTool";
import { ReassignYearsTool } from "./ReassignYearsTool";
import { prisma } from "@/lib/prisma";
import { getCurrentClubYear } from "@/lib/dataAccess";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const { rows, duplicates, duplicateCount, duplicateSum } = await auditAccountBalances();

  const accounts = await prisma.account.findMany({ orderBy: { type: "asc" } });
  const clubYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  const currentCY = await getCurrentClubYear();

  // Pivot: pro Jahr eine Zeile, beide Konten nebeneinander
  const byYear = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byYear.get(r.yearId) ?? [];
    arr.push(r);
    byYear.set(r.yearId, arr);
  }
  const yearOrder = [...new Set(rows.map((r) => r.yearId))]
    .sort((a, b) => {
      const aR = byYear.get(a)?.[0];
      const bR = byYear.get(b)?.[0];
      return (bR?.startsAt.getTime() ?? 0) - (aR?.startsAt.getTime() ?? 0);
    });

  const hasIssues =
    duplicateCount > 0 || rows.some((r) => !r.ok && r.carryOverDelta != null);

  return (
    <div className="space-y-5 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-bold flex items-center gap-2">
            <Wallet className="size-6 text-blue-800 shrink-0" /> Konten &amp; Saldo-Prüfung
          </h1>
          <p className="text-slate-500 text-sm">
            Eröffnungs- und Endsalden je Clubjahr, Übernahme-Kontrolle und
            Doppelbuchungs-Erkennung.
          </p>
        </div>
        <div
          className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 ${
            hasIssues
              ? "bg-rose-50 text-rose-700 border border-rose-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {hasIssues ? (
            <>
              <AlertTriangle className="size-4" /> Prüfung: Probleme gefunden
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" /> Prüfung: alles in Ordnung
            </>
          )}
        </div>
      </header>

      {/* Audit-Tabelle pro Jahr × Konto */}
      <section className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-3">
          <h2 className="font-semibold">Saldo-Übersicht pro Clubjahr</h2>
          <span className="text-xs text-slate-500">
            Erwartet: Endsaldo Jahr N = Eröffnungssaldo Jahr N+1
          </span>
        </div>
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Clubjahr</th>
                  <th>Konto</th>
                  <th className="text-right">Eröffnungssaldo</th>
                  <th className="text-right">Bewegungen</th>
                  <th className="text-right">Endsaldo (berechnet)</th>
                  <th className="text-right">Übernahme Folgejahr</th>
                  <th>Status</th>
                  {canEdit && <th><span className="sr-only">Aktion</span></th>}
                </tr>
              </thead>
              <tbody>
                {yearOrder.map((yearId) => {
                  const accs = byYear.get(yearId) ?? [];
                  return accs.map((r, idx) => (
                    <tr key={`${r.yearId}-${r.accountType}`}>
                      {idx === 0 && (
                        <td data-label="Clubjahr" rowSpan={accs.length} className="font-semibold align-top">
                          <div>{r.yearLabel}</div>
                          <div className="text-xs text-slate-500 font-normal">
                            ab {formatDate(r.startsAt)}
                            {r.isClosed && <span className="ml-1 chip chip-cancelled">geschlossen</span>}
                          </div>
                        </td>
                      )}
                      <td data-label="Konto" className="text-sm">
                        {r.accountType === "MAIN" ? "Hauptkonto" : "Global-Grant Treuhand"}
                      </td>
                      <td data-label="Eröffnungssaldo" className="text-right font-mono tabular">
                        {formatEUR(r.openingBalance)}
                      </td>
                      <td data-label="Bewegungen" className="text-right font-mono tabular">
                        <span className={r.movementsSum >= 0 ? "amount-pos" : "amount-neg"}>
                          {formatEUR(r.movementsSum)}
                        </span>
                        <div className="text-xs text-slate-400 font-normal">{r.txCount} Buchungen</div>
                      </td>
                      <td data-label="Endsaldo" className="text-right font-mono tabular font-semibold">
                        {formatEUR(r.computedClosing)}
                      </td>
                      <td data-label="Übernahme Folgejahr" className="text-right text-sm">
                        {r.expectedNextOpening == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="font-mono tabular">
                              gespeichert: {formatEUR(r.storedNextOpening)}
                            </div>
                            {r.carryOverDelta != null && Math.abs(r.carryOverDelta) >= 0.01 && (
                              <div className="text-xs text-rose-600 font-mono">
                                Δ {formatEUR(r.carryOverDelta)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td data-label="Status">
                        {r.expectedNextOpening == null ? (
                          <span className="chip chip-active">aktuelles Jahr</span>
                        ) : r.ok ? (
                          <span className="chip chip-paid"><CheckCircle2 className="size-3" /> übernommen</span>
                        ) : (
                          <span className="chip chip-cancelled"><AlertTriangle className="size-3" /> Mismatch</span>
                        )}
                      </td>
                      {canEdit && (
                        <td data-label="Aktion" className="text-right">
                          <OpeningBalanceEditor
                            yearId={r.yearId}
                            yearLabel={r.yearLabel}
                            accountType={r.accountType}
                            currentValue={r.openingBalance}
                          />
                        </td>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Duplikate */}
      <section className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            Doppelbuchungs-Verdacht
            <span
              className={`chip ${duplicateCount > 0 ? "chip-cancelled" : "chip-paid"}`}
            >
              {duplicateCount} Doppelung{duplicateCount === 1 ? "" : "en"}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Erkannt, wenn an demselben Tag im selben Konto der gleiche Betrag
            sowohl als Bank-Import (mit Buchungsreferenz) als auch als manuell
            erfasste Buchung (ohne Referenz) existiert. Doppelter Wert summiert:{" "}
            <span className="font-mono">{formatEUR(duplicateSum)}</span>.
          </p>
        </div>
        {duplicates.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 text-center">
            Keine Doppelungen entdeckt – {""}
            <CheckCircle2 className="inline size-4 text-emerald-600 align-text-bottom" />
          </div>
        ) : (
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Konto</th>
                    <th className="text-right">Betrag</th>
                    <th>Buchungen</th>
                    {canEdit && <th><span className="sr-only">Aktion</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {duplicates.map((g, gi) => (
                    <tr key={gi}>
                      <td data-label="Datum" className="whitespace-nowrap">{formatDate(g.date)}</td>
                      <td data-label="Konto" className="text-sm">
                        {g.accountType === "MAIN" ? "Haupt" : "GG"}
                      </td>
                      <td data-label="Betrag" className={`text-right font-mono tabular ${g.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                        {formatEUR(g.amount)}
                      </td>
                      <td data-label="Buchungen" className="text-xs">
                        <ul className="space-y-1">
                          {g.rows.map((row) => (
                            <li key={row.id} className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${row.externalRef ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                                {row.externalRef ? "Bank-Import" : "Manuell"}
                              </span>
                              <Link href={`/transactions/${row.id}`} className="text-blue-700 hover:underline truncate max-w-[280px]">
                                {row.counterparty || row.purpose || "—"}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </td>
                      {canEdit && (
                        <td data-label="Aktion" className="text-right">
                          <DuplicateResolver
                            rows={g.rows.map((r) => ({
                              id: r.id,
                              hasRef: !!r.externalRef,
                              label: r.counterparty || r.purpose || r.id,
                            }))}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Clubjahr-Zuordnung reparieren */}
      {canEdit && (
        <section className="card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <Wallet className="size-4 text-blue-700" />
              Clubjahr-Zuordnung prüfen &amp; reparieren
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Ordnet jede Buchung dem rotarischen Jahr (1.7.–30.6.) zu, in das
              ihr Buchungsdatum fällt. Damit werden z.&nbsp;B. Juli-Buchungen,
              die noch fälschlich im alten Jahr hingen, ins richtige neue Jahr
              verschoben. Fixierte (archivierte) Jahre bleiben unverändert.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <ReassignYearsTool />
          </div>
        </section>
      )}

      {/* Bank-Abgleich Tool */}
      {canEdit && (
        <section className="card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <ScanSearch className="size-4 text-blue-700" />
              Bank-Abgleich (Vollvergleich)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Trage zuerst den Bank-Endsaldo aus George ein, um sofort die
              Differenz zur Datenbank zu sehen. Für eine zeilengenaue Analyse
              kannst du danach die George-CSV/XLSX hochladen — die App listet
              jede fehlende oder überzählige Buchung auf den Cent.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <ReconcileTool
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, iban: a.iban }))}
              clubYears={clubYears.map((y) => ({ id: y.id, label: y.label }))}
              defaultAccountId={accounts.find((a) => a.type === "MAIN")?.id ?? accounts[0]?.id}
              defaultClubYearId={currentCY.id}
              closingByYearAccount={Object.fromEntries(
                rows.map((r) => [
                  `${r.yearId}|${r.accountType === "MAIN" ? "MAIN" : "GG"}`,
                  r.computedClosing,
                ]),
              )}
              accountTypeById={Object.fromEntries(accounts.map((a) => [a.id, a.type]))}
            />
          </div>
        </section>
      )}

      {/* Hilfe-Hinweis */}
      <section className="card-soft p-4 sm:p-5 bg-blue-50/50 border border-blue-100">
        <h3 className="font-semibold text-blue-900 flex items-center gap-2">
          <Settings2 className="size-4" /> Was prüft diese Seite?
        </h3>
        <ul className="text-sm text-slate-700 mt-2 space-y-1 list-disc list-inside">
          <li>
            <b>Eröffnungssaldo</b> = manuell hinterlegter Anfangsstand des
            jeweiligen Clubjahres (1.7.).
          </li>
          <li>
            <b>Endsaldo (berechnet)</b> = Eröffnungssaldo + Summe aller
            Buchungen dieses Jahres.
          </li>
          <li>
            <b>Übernahme Folgejahr</b>: Stimmt der gespeicherte
            Eröffnungssaldo des Folgejahres mit dem berechneten Endsaldo
            überein? Bei Δ &gt; 0,01 €
            <ArrowRight className="inline size-3 mx-1" /> Mismatch.
          </li>
          <li>
            <b>Doppelbuchungs-Verdacht</b>: Identische Buchungen können
            entstehen, wenn dieselben Bewegungen sowohl manuell als auch
            via Bank-Datei importiert wurden.
          </li>
        </ul>
      </section>
    </div>
  );
}