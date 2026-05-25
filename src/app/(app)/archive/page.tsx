import { prisma } from "@/lib/prisma";
import { Archive } from "lucide-react";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { ArchiveActions } from "./ArchiveActions";
import { YearLifecycleControls } from "./YearLifecycleControls";
import { formatDate, formatEUR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const years = await prisma.clubYear.findMany({
    orderBy: { startsAt: "desc" },
    include: { archivedYear: true, _count: { select: { transactions: true } } },
  });

  return (
    <div className="space-y-5 fade-up">
      <header>
        <h1 className="font-bold flex items-center gap-2"><Archive className="size-6 text-blue-800 shrink-0" /> Archiv & Clubjahre</h1>
        <p className="text-slate-500 text-sm">Lebenszyklus eines Clubjahres: Laufend → Abgeschlossen → Geprüft → von der Mitgliederversammlung Fixiert. Excel-Export & -Re-Import zur Korrektur.</p>
      </header>

      {canEdit && <ArchiveActions />}

      <div className="card-soft p-3 sm:p-5 space-y-1">
        <h2 className="font-semibold mb-1">Lebenszyklus</h2>
        <p className="text-sm text-slate-500">
          Buchungen werden im laufenden Clubjahr (1.7.–30.6.) erfasst. Nach dem Bilanzstichtag schließt der Schatzmeister das Jahr ab. Die Rechnungsprüfer setzen ihren Prüfvermerk; rund 6 Monate nach 30.6. fixiert die Mitgliederversammlung das Jahr endgültig. Ab dann ist das Jahr ausschließlich lesbar und steht als finale Excel-Datei im Archiv.
        </p>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Clubjahr</th>
                  <th>Zeitraum</th>
                  <th>Buchungen</th>
                  <th>Eröffnungssaldo</th>
                  <th>Lebenszyklus & Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => {
                  const yJson = {
                    id: y.id,
                    label: y.label,
                    isClosed: y.isClosed,
                    closedAt: y.closedAt?.toISOString() ?? null,
                    auditedAt: y.auditedAt?.toISOString() ?? null,
                    lockedAt: y.lockedAt?.toISOString() ?? null,
                    archived: !!y.archivedYear,
                    hasArchiveFile: !!y.archivedYear?.fileName,
                  };
                  return (
                    <tr key={y.id}>
                      <td data-label="Clubjahr" className="font-semibold">{y.label}</td>
                      <td data-label="Zeitraum" className="text-sm whitespace-nowrap">{formatDate(y.startsAt)} – {formatDate(y.endsAt)}</td>
                      <td data-label="Buchungen" className="font-mono">{y._count.transactions}</td>
                      <td data-label="Eröffnungssaldo" className="text-sm tabular">Haupt {formatEUR(y.openingBalanceMain)} · GG {formatEUR(y.openingBalanceGG)}</td>
                      <td data-label="Aktionen" className="min-w-[280px]">
                        <YearLifecycleControls year={yJson} canEdit={canEdit} />
                        {(y.closedAt || y.auditedAt || y.lockedAt) && (
                          <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                            {y.closedAt && <>Abgeschlossen: {formatDate(y.closedAt)} · </>}
                            {y.auditedAt && <>Geprüft: {formatDate(y.auditedAt)} · </>}
                            {y.lockedAt && <>Fixiert: {formatDate(y.lockedAt)}</>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}