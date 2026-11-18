"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Download,
  ListChecks,
  Info,
} from "lucide-react";

type Settings = {
  creditorId: string;
  creditorName: string;
  creditorStreet: string;
  creditorPostalCode: string;
  creditorTown: string;
  creditorCountry: string;
  auftraggeberIban: string;
  /** Im Speicher als TT.MM.JJJJ; im Formular als YYYY-MM-DD gehalten. */
  mandateDate: string;
  verwendungszweck: string;
};

type Proposal = {
  memberId: string;
  name: string;
  currentIban: string;
  proposedIban: string;
};

/** TT.MM.JJJJ → YYYY-MM-DD (für <input type="date">). Leer bei Fehlformat. */
function deToIso(de: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(de.trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** YYYY-MM-DD → TT.MM.JJJJ. Leer bei Fehlformat. */
function isoToDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** IBAN mittig maskieren: erste 4 + letzte 4 Zeichen sichtbar. */
function maskIban(iban: string): string {
  const s = (iban ?? "").replace(/\s+/g, "");
  if (!s) return "—";
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}${"•".repeat(Math.min(s.length - 8, 12))}${s.slice(-4)}`;
}

export function SepaSettingsPanel({
  initial,
  auftraggeberIbanSuggested,
}: {
  initial: Settings;
  auftraggeberIbanSuggested: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    creditorId: initial.creditorId,
    creditorName: initial.creditorName,
    creditorStreet: initial.creditorStreet,
    creditorPostalCode: initial.creditorPostalCode,
    creditorTown: initial.creditorTown,
    creditorCountry: initial.creditorCountry || "Österreich",
    auftraggeberIban: initial.auftraggeberIban || auftraggeberIbanSuggested,
    mandateDateIso: deToIso(initial.mandateDate),
    verwendungszweck: initial.verwendungszweck,
  });

  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill-IBAN-Zustand
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [prefillBusy, setPrefillBusy] = useState<null | "load" | "apply">(null);
  const [prefillMsg, setPrefillMsg] = useState<string | null>(null);
  const [prefillErr, setPrefillErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      const res = await fetch("/api/sepa/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditorId: form.creditorId.trim(),
          creditorName: form.creditorName.trim(),
          creditorStreet: form.creditorStreet.trim(),
          creditorPostalCode: form.creditorPostalCode.trim(),
          creditorTown: form.creditorTown.trim(),
          creditorCountry: form.creditorCountry.trim(),
          auftraggeberIban: form.auftraggeberIban.replace(/\s+/g, "").toUpperCase(),
          mandateDate: isoToDe(form.mandateDateIso),
          verwendungszweck: form.verwendungszweck.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Fehler ${res.status}`);
      setOk("Einstellungen gespeichert.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function loadProposals() {
    setPrefillBusy("load");
    setPrefillErr(null);
    setPrefillMsg(null);
    try {
      const res = await fetch("/api/sepa/prefill-ibans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Fehler ${res.status}`);
      setProposals(data.proposals as Proposal[]);
      if ((data.proposals as Proposal[]).length === 0) {
        setPrefillMsg("Keine neuen IBANs aus der Buchungshistorie gefunden.");
      }
    } catch (err) {
      setPrefillErr(err instanceof Error ? err.message : "Laden fehlgeschlagen.");
    } finally {
      setPrefillBusy(null);
    }
  }

  async function applyProposals() {
    setPrefillBusy("apply");
    setPrefillErr(null);
    setPrefillMsg(null);
    try {
      const res = await fetch("/api/sepa/prefill-ibans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Fehler ${res.status}`);
      setPrefillMsg(
        `${data.appliedCount} IBAN(s) übernommen (nur bei leeren Feldern).`,
      );
      setProposals(null);
      router.refresh();
    } catch (err) {
      setPrefillErr(err instanceof Error ? err.message : "Übernahme fehlgeschlagen.");
    } finally {
      setPrefillBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Einstellungen */}
      <form onSubmit={save} className="card-soft p-4 sm:p-5 space-y-4">
        <h2 className="font-semibold text-slate-800">Einzugs-Einstellungen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Creditor-ID (Gläubiger-ID)
            </label>
            <input
              className="input font-mono"
              placeholder="AT12ZZZ00000000000"
              value={form.creditorId}
              onChange={(e) => setForm({ ...form, creditorId: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Gläubiger-Name (Vereinsname)
            </label>
            <input
              className="input"
              placeholder="Rotary Club Wien-Donau"
              value={form.creditorName}
              onChange={(e) => setForm({ ...form, creditorName: e.target.value })}
            />
            <p className="text-xs text-slate-400 mt-1">
              Für die XML-Datei (Datenträger) nötig; erscheint als Auftraggeber.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Auftraggeber-IBAN (Clubkonto)
            </label>
            <input
              className="input font-mono"
              placeholder="AT00 0000 0000 0000 0000"
              value={form.auftraggeberIban}
              onChange={(e) =>
                setForm({ ...form, auftraggeberIban: e.target.value })
              }
              required
            />
            {!initial.auftraggeberIban && auftraggeberIbanSuggested && (
              <p className="text-xs text-slate-400 mt-1">
                Vorschlag aus dem Hauptkonto übernommen.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Mandatsausstellungsdatum (clubweit)
            </label>
            <input
              type="date"
              className="input"
              value={form.mandateDateIso}
              onChange={(e) =>
                setForm({ ...form, mandateDateIso: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Verwendungszweck-Vorlage (optional)
            </label>
            <input
              className="input"
              placeholder="Mitgliedsbeitrag"
              value={form.verwendungszweck}
              onChange={(e) =>
                setForm({ ...form, verwendungszweck: e.target.value })
              }
            />
            <p className="text-xs text-slate-400 mt-1">
              Wird nur verwendet, wenn eine Forderung keinen eigenen
              Verwendungszweck hat.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">
            Gläubiger-Adresse (für XML / ISO-2019)
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            George verlangt für die XML-Datei strukturierte Adressen. Einmalig
            die Vereinsadresse eintragen.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold mb-1 block">Straße + Nr.</label>
              <input
                className="input"
                placeholder="Hauptstraße 1"
                value={form.creditorStreet}
                onChange={(e) => setForm({ ...form, creditorStreet: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">PLZ</label>
              <input
                className="input"
                placeholder="1220"
                value={form.creditorPostalCode}
                onChange={(e) => setForm({ ...form, creditorPostalCode: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Ort</label>
              <input
                className="input"
                placeholder="Wien"
                value={form.creditorTown}
                onChange={(e) => setForm({ ...form, creditorTown: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Land</label>
              <input
                className="input"
                placeholder="Österreich"
                value={form.creditorCountry}
                onChange={(e) => setForm({ ...form, creditorCountry: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}{" "}
            Einstellungen speichern
          </button>
          {ok && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> {ok}
            </p>
          )}
          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="size-4" /> {error}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900 flex items-start gap-2">
          <Info className="size-4 shrink-0 mt-0.5" />
          <span>
            Die Mandatsreferenz wird automatisch erzeugt. Falls Sie bestehende
            Mandatsreferenzen haben, tragen wir diese besser nach — bei
            bestehenden Mandaten kann die Bank abweichende Referenzen
            beanstanden.
          </span>
        </div>
      </form>

      {/* IBANs aus Historie befüllen */}
      <div className="card-soft p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ListChecks className="size-4 text-blue-800" /> IBANs aus Historie
            befüllen
          </h2>
          <p className="text-slate-500 text-sm">
            Ermittelt die zuletzt in SEPA-Buchungen gesehene IBAN je Mitglied.
            Beim Übernehmen werden nur leere IBAN-Felder gesetzt — bestehende
            IBANs bleiben unverändert.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={loadProposals}
            disabled={prefillBusy !== null}
          >
            {prefillBusy === "load" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}{" "}
            Vorschläge laden
          </button>
          {proposals && proposals.length > 0 && (
            <button
              type="button"
              className="btn-primary"
              onClick={applyProposals}
              disabled={prefillBusy !== null}
            >
              {prefillBusy === "apply" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}{" "}
              Übernehmen ({proposals.length})
            </button>
          )}
        </div>

        {prefillMsg && (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" /> {prefillMsg}
          </p>
        )}
        {prefillErr && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="size-4" /> {prefillErr}
          </p>
        )}

        {proposals && proposals.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mitglied</th>
                  <th>Aktuelle IBAN</th>
                  <th>Vorgeschlagene IBAN</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.memberId}>
                    <td data-label="Mitglied" className="font-medium">
                      {p.name}
                    </td>
                    <td
                      data-label="Aktuelle IBAN"
                      className="font-mono text-xs text-slate-500"
                    >
                      {maskIban(p.currentIban)}
                    </td>
                    <td
                      data-label="Vorgeschlagene IBAN"
                      className="font-mono text-xs"
                    >
                      {maskIban(p.proposedIban)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
