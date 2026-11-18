import { prisma } from "@/lib/prisma";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getCurrentClubYear } from "@/lib/dataAccess";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Landmark, AlertTriangle } from "lucide-react";
import { SepaSettingsPanel } from "./SepaSettingsPanel";
import { SepaExportControls } from "@/components/SepaExportControls";

export const dynamic = "force-dynamic";

const PREFIX = "sepa.";

export default async function SepaSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/dashboard");

  // Einstellungen + Übersicht + Clubjahre parallel laden.
  const [settingRows, main, sepaMembers, allYears, currentYear] = await Promise.all([
    prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX } } }),
    prisma.account.findFirst({
      where: { type: "MAIN", iban: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.member.findMany({
      where: { status: "ACTIVE", paysBySEPA: true },
      select: { id: true, iban: true, lastName: true, firstName: true, rotaryMemberId: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } }),
    getCurrentClubYear(),
  ]);

  const raw: Record<string, string> = {};
  for (const r of settingRows) raw[r.key.slice(PREFIX.length)] = r.value;

  const initial = {
    creditorId: raw.creditorId ?? "",
    auftraggeberIban: raw.auftraggeberIban ?? "",
    mandateDate: raw.mandateDate ?? "",
    verwendungszweck: raw.verwendungszweck ?? "",
  };
  const auftraggeberIbanSuggested = initial.auftraggeberIban ? "" : (main?.iban ?? "");

  const sepaTotal = sepaMembers.length;
  const missingMembers = sepaMembers.filter((m) => (m.iban ?? "").replace(/\s+/g, "").length === 0);
  const withIban = sepaTotal - missingMembers.length;
  const withoutIban = missingMembers.length;

  const stats = [
    { label: "SEPA-Zahler", value: sepaTotal },
    { label: "mit IBAN", value: withIban },
    { label: "ohne IBAN", value: withoutIban },
  ];

  return (
    <div className="max-w-3xl fade-up space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="size-6 text-blue-800" /> SEPA-Einzug
        </h1>
        <p className="text-slate-500 text-sm">
          Einstellungen und Export der SEPA-Sammellastschrift für die
          Mitgliedsbeiträge (George Business, Erste/Sparkasse).
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-soft p-3 text-center">
            <div className="text-xl font-bold text-slate-800">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {withoutIban > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5 space-y-2">
          <h2 className="font-semibold text-red-800 flex items-center gap-2">
            <AlertTriangle className="size-5" /> {withoutIban} SEPA-Zahler ohne IBAN
          </h2>
          <p className="text-sm text-red-700">
            Diese Mitglieder haben eine Einzugsermächtigung, aber keine hinterlegte IBAN —
            sie werden beim Export <strong>nicht</strong> eingezogen. Bitte IBAN beim Mitglied ergänzen.
          </p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {missingMembers.map((m) => (
              <li key={m.id}>
                <Link href={`/members/${m.id}`} className="inline-flex items-center gap-1 rounded-lg bg-white border border-red-200 px-2.5 py-1 text-sm text-red-800 hover:border-red-400">
                  {m.lastName}, {m.firstName}
                  {m.rotaryMemberId ? <span className="text-xs text-red-400 font-mono">#{m.rotaryMemberId}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/members?missing=iban" className="inline-block text-sm font-medium text-red-800 underline pt-1">
            In der Mitgliederliste anzeigen →
          </Link>
        </section>
      )}

      <SepaSettingsPanel
        initial={initial}
        auftraggeberIbanSuggested={auftraggeberIbanSuggested}
      />

      <section className="card-soft p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-800">
            SEPA-Sammellastschrift exportieren
          </h2>
          <p className="text-slate-500 text-sm">
            Clubjahr wählen, optional ein Fälligkeitsdatum setzen, Vorschau
            prüfen und die George-CSV herunterladen.
          </p>
        </div>
        <SepaExportControls initialClubYearId={currentYear.id} clubYears={allYears.map((y) => ({ id: y.id, label: y.label }))} />
      </section>
    </div>
  );
}
