import { prisma } from "@/lib/prisma";
import { ImportForm } from "./ImportForm";
import { SepaImportForm } from "./SepaImportForm";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getCurrentClubYear } from "@/lib/dataAccess";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/transactions");
  const accounts = await prisma.account.findMany();
  const cy = await getCurrentClubYear();
  const years = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  return (
    <div className="max-w-4xl fade-up space-y-10">
      <section>
        <h1 className="text-2xl font-bold mb-1">Bank-Import (George / Erste Bank)</h1>
        <p className="text-slate-500 text-sm mb-6">
          Lade die Umsatz-Datei aus George (<strong>CSV oder XLSX</strong>). Spalten werden
          automatisch erkannt (<code>Buchungsdatum</code>, <code>Durchführungsdatum</code>,{" "}
          <code>Partner Name</code>, <code>Buchungs-Details</code>, <code>Betrag</code>,{" "}
          <code>Buchungsreferenz</code> u. v. m.). Die App sucht die <strong>letzte
          bereits vorhandene Buchung</strong> auf dem gewählten Konto und ergänzt nur
          neuere Zeilen. Duplikate (über die Bank-Buchungsreferenz) werden automatisch erkannt
          und nicht doppelt importiert. Offene Mitgliedsbeitrags-Forderungen werden anhand
          Name + Betrag automatisch gematcht.
        </p>
        <ImportForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
          years={years.map((y) => ({ id: y.id, label: y.label }))}
          defaultClubYearId={cy.id}
        />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-1">SEPA-Sammeleinzug aufteilen (PDF)</h2>
        <p className="text-slate-500 text-sm mb-6">
          Bei einem SEPA-Sammeleinzug erscheint im Bank-Import nur <em>eine</em> Buchung
          mit der Lastschriftsumme. Lade hier zusätzlich das George-PDF mit der
          Sammeleinzug-Liste hoch, um die Sammelbuchung auf einzelne Mitglieder
          aufzuteilen. Für jeden Eintrag wird das Mitglied (über Nachname / IBAN)
          erkannt; offene Forderungen (z. B. Mitgliedsbeiträge) werden anhand Name +
          Betrag <strong>automatisch ausgeglichen</strong>.
        </p>
        <SepaImportForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        />
      </section>
    </div>
  );
}