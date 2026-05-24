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
        <h1 className="text-2xl font-bold flex items-center gap-2"><Archive className="size-6 text-blue-800" /> Archiv & Clubjahre</h1>
        <p className="text-slate-500 text-sm">Clubjahre verwalten, abschließen und historische Daten via Excel importieren.</p>
      </header>

      {canEdit && <ArchiveActions />}

      <div className="card-soft overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Clubjahr</th>
              <th>Zeitraum</th>
              <th>Status</th>
              <th>Buchungen</th>
              <th>Eröffnungssaldo</th>
              <th>Archiv</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id}>
                <td className="font-semibold">{y.label}</td>
                <td className="text-sm">{formatDate(y.startsAt)} – {formatDate(y.endsAt)}</td>
                <td>{y.isClosed ? <span className="chip chip-cancelled"><Lock className="size-3" /> Geschlossen</span> : <span className="chip chip-active"><Unlock className="size-3" /> Aktiv</span>}</td>
                <td className="font-mono">{y._count.transactions}</td>
                <td className="text-sm tabular">Haupt {formatEUR(y.openingBalanceMain)} · GG {formatEUR(y.openingBalanceGG)}</td>
                <td className="text-xs">{y.archivedYear ? "✓ archiviert" : "—"}</td>
                {canEdit && (
                  <td className="text-right">
                    {!y.isClosed && <CloseYearBtn id={y.id} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { CloseYearBtn } from "./CloseYearBtn";