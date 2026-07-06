"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Loader2, ArrowRight, Scale } from "lucide-react";

type Flow = { label: string; count: number };
type Result = {
  dryRun: boolean;
  total: number;
  moved: number;
  skippedLocked: number;
  unchanged: number;
  flows: Flow[];
};

type OpeningChange = {
  yearLabel: string;
  account: "MAIN" | "GG";
  storedOpening: number;
  computedOpening: number;
  delta: number;
};
type OpeningResult = {
  dryRun: boolean;
  changed: number;
  changes: OpeningChange[];
};

function eur(n: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export function ReassignYearsTool() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Eröffnungssaldo-Kette
  const [obBusy, setObBusy] = useState(false);
  const [obResult, setObResult] = useState<OpeningResult | null>(null);
  const [obError, setObError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/reassign-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Fehler (HTTP ${res.status}).`);
        return;
      }
      setResult(data);
      if (!dryRun) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runOpenings(dryRun: boolean) {
    setObBusy(true);
    setObError(null);
    try {
      const res = await fetch("/api/accounts/recompute-openings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setObError(data?.error ?? `Fehler (HTTP ${res.status}).`);
        return;
      }
      setObResult(data);
      if (!dryRun) router.refresh();
    } finally {
      setObBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 btn-row">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => run(true)}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
          Vorschau
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !result || result.moved === 0}
          onClick={() => {
            if (
              confirm(
                `Wirklich ${result?.moved ?? 0} Buchung(en) dem korrekten rotarischen Jahr zuordnen?\n\nFixierte Jahre bleiben unverändert.`,
              )
            )
              run(false);
          }}
        >
          Jetzt reparieren
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-slate-600">Buchungen gesamt: <b>{result.total}</b></span>
            <span className={result.moved > 0 ? "text-amber-700" : "text-emerald-700"}>
              {result.dryRun ? "Würde umbuchen" : "Umgebucht"}: <b>{result.moved}</b>
            </span>
            <span className="text-slate-600">Bereits korrekt: <b>{result.unchanged}</b></span>
            {result.skippedLocked > 0 && (
              <span className="text-slate-500">Fixiert (übersprungen): <b>{result.skippedLocked}</b></span>
            )}
          </div>
          {result.flows.length > 0 && (
            <ul className="space-y-1">
              {result.flows.map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-slate-700">
                  <ArrowRight className="size-3 text-blue-600 shrink-0" />
                  <span className="font-mono text-xs">{f.label}</span>
                  <span className="chip chip-active">{f.count}</span>
                </li>
              ))}
            </ul>
          )}
          {result.dryRun && result.moved > 0 && (
            <p className="text-xs text-slate-500">
              Dies ist nur eine Vorschau. Klicke auf „Jetzt reparieren", um die
              Umbuchung durchzuführen.
            </p>
          )}
          {!result.dryRun && (
            <p className="text-xs text-emerald-700">
              Fertig. Bitte anschließend die Eröffnungssaldo-Kette neu
              berechnen (Schritt 2 unten), damit die Übernahme stimmt.
            </p>
          )}
        </div>
      )}

      {/* Schritt 2: Eröffnungssaldo-Kette */}
      <div className="pt-3 mt-2 border-t border-slate-200 space-y-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Scale className="size-4 text-blue-700" />
            Eröffnungssaldo-Übernahme neu berechnen
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Setzt die Kette konsistent: Endsaldo eines Jahres = Eröffnungssaldo
            des Folgejahres. Nötig nach dem Verschieben oder Stornieren von
            Buchungen. Das früheste sowie fixierte Jahre bleiben unverändert.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 btn-row">
          <button type="button" className="btn-ghost" disabled={obBusy} onClick={() => runOpenings(true)}>
            {obBusy ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />}
            Vorschau
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={obBusy || !obResult || obResult.changed === 0}
            onClick={() => {
              if (
                confirm(
                  `Eröffnungssalden von ${obResult?.changed ?? 0} Jahr(en) an die Übernahme anpassen?`,
                )
              )
                runOpenings(false);
            }}
          >
            Übernahme anwenden
          </button>
        </div>

        {obError && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            {obError}
          </div>
        )}

        {obResult && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-2">
            {obResult.changes.length === 0 ? (
              <p className="text-emerald-700">
                Übernahme-Kette ist bereits konsistent – keine Änderung nötig.
              </p>
            ) : (
              <>
                <div className={obResult.dryRun ? "text-amber-700" : "text-emerald-700"}>
                  {obResult.dryRun ? "Würde anpassen" : "Angepasst"}: <b>{obResult.changed}</b> Jahr(e)
                </div>
                <ul className="space-y-1">
                  {obResult.changes.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-slate-700">
                      <span className="font-mono text-xs">
                        {c.yearLabel} · {c.account === "MAIN" ? "Haupt" : "GG"}
                      </span>
                      <span className="font-mono text-xs">{eur(c.storedOpening)}</span>
                      <ArrowRight className="size-3 text-blue-600 shrink-0" />
                      <span className="font-mono text-xs font-semibold">{eur(c.computedOpening)}</span>
                      <span className={`text-xs font-mono ${Math.abs(c.delta) >= 0.005 ? "text-rose-600" : "text-slate-400"}`}>
                        (Δ {eur(c.delta)})
                      </span>
                    </li>
                  ))}
                </ul>
                {obResult.dryRun && (
                  <p className="text-xs text-slate-500">
                    Nur Vorschau. Klicke „Übernahme anwenden", um die
                    Eröffnungssalden zu setzen.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}