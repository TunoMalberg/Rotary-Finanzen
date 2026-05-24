import { prisma } from "@/lib/prisma";
import { Archive, Lock, Unlock } from "lucide-react";
import Link from "next/link";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { ArchiveActions } from "./ArchiveActions";
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
        <p className="text-slate-500 text-sm">Clubjahre verwalten, abschließen und historische Daten via Excel importieren.</p>
      </header>

      {canEdit && <ArchiveActions />}

      <div className="card-soft overflow-hidden">
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Clubjahr</th>
                  <th>Zeitraum</th>
                  <th>Status</th>
                  <th>Buchungen</th>
                  <th>Eröffnungssaldo</th>
                  <th>Archiv</th>
                  {canEdit && <th><span className="sr-only">Aktion</span></th>}
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.id}>
                    <td data-label="Clubjahr" className="font-semibold">{y.label}</td>
                    <td data-label="Zeitraum" className="text-sm whitespace-nowrap">{formatDate(y.startsAt)} – {formatDate(y.endsAt)}</td>
                    <td data-label="Status">{y.isClosed ? <span className="chip chip-cancelled"><Lock className="size-3" /> Geschlossen</span> : <span className="chip chip-active"><Unlock className="size-3" /> Aktiv</span>}</td>
                    <td data-label="Buchungen" className="font-mono">{y._count.transactions}</td>
                    <td data-label="Eröffnungssaldo" className="text-sm tabular">Haupt {formatEUR(y.openingBalanceMain)} · GG {formatEUR(y.openingBalanceGG)}</td>
                    <td data-label="Archiv" className="text-xs">{y.archivedYear ? "✓ archiviert" : "—"}</td>
                    {canEdit && (
                      <td data-label="Aktion" className="text-right">
                        {!y.isClosed && <CloseYearBtn id={y.id} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import { CloseYearBtn } from "./CloseYearBtn";