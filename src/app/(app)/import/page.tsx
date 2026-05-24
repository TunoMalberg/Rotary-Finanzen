import { prisma } from "@/lib/prisma";
import { ImportForm } from "./ImportForm";
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
    <div className="max-w-4xl fade-up">
      <h1 className="text-2xl font-bold mb-1">Bank-Import (George / Erste Bank)</h1>
      <p className="text-slate-500 text-sm mb-6">
        Lade die CSV-Datei mit den Umsätzen aus George. Spalten werden automatisch erkannt
        (<code>Buchungsdatum / Datum</code>, <code>Betrag</code>, <code>Verwendungszweck</code>,
        <code>Auftraggeber/Empfänger</code>, <code>Währung</code> usw.). Duplikate werden automatisch
        erkannt und nicht doppelt importiert. Offene Mitgliedsbeitrags-Forderungen werden
        anhand Name + Betrag automatisch gematcht.
      </p>
      <ImportForm
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        years={years.map((y) => ({ id: y.id, label: y.label }))}
        defaultClubYearId={cy.id}
      />
    </div>
  );
}