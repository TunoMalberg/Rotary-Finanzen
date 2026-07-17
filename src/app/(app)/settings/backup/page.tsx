import { prisma } from "@/lib/prisma";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { DatabaseBackup } from "lucide-react";
import { BackupPanel } from "./BackupPanel";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/dashboard");

  // Ein paar Kennzahlen, damit klar ist, was das Backup enthält.
  const [transactions, members, accounts, invoices, clubYears] = await Promise.all([
    prisma.transaction.count(),
    prisma.member.count(),
    prisma.account.count(),
    prisma.invoice.count(),
    prisma.clubYear.count(),
  ]);

  const stats: { label: string; value: number }[] = [
    { label: "Buchungen", value: transactions },
    { label: "Mitglieder", value: members },
    { label: "Konten", value: accounts },
    { label: "Rechnungen", value: invoices },
    { label: "Clubjahre", value: clubYears },
  ];

  return (
    <div className="max-w-3xl fade-up space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DatabaseBackup className="size-6 text-blue-800" /> Backup
        </h1>
        <p className="text-slate-500 text-sm">
          Vollständige Sicherung aller Daten als JSON-Datei zum lokalen Speichern.
          Empfohlen vor größeren Änderungen und regelmäßig als Vorsichtsmaßnahme.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>

        <BackupPanel />

        <p className="text-xs text-slate-400">
          Das Backup enthält alle Tabellen der Datenbank (inkl. Zugangs-Hashes) und ist
          vertraulich. Bewahren Sie die Datei sicher auf. Die Produktionsdaten selbst
          werden durch das Herunterladen nicht verändert.
        </p>
      </section>
    </div>
  );
}
