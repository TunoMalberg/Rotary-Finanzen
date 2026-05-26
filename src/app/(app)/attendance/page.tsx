import { prisma } from "@/lib/prisma";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, formatEUR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const lists = await prisma.attendanceList.findMany({
    orderBy: { eventDate: "desc" },
    include: { entries: { include: { invoice: true } }, clubYear: true },
  });

  return (
    <div className="space-y-5 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-bold flex items-center gap-2"><ListChecks className="size-6 text-blue-800 shrink-0" /> Auslagenprojekte</h1>
          <p className="text-slate-500 text-sm">Veranstaltungen / Ausflüge – Kostenverrechnung an Mitglieder &amp; Gäste</p>
        </div>
        {canEdit && (
          <div className="btn-row w-full sm:w-auto">
            <Link href="/attendance/new" className="btn-primary"><Plus className="size-4" /> Neue Liste</Link>
          </div>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {lists.map((l) => {
          const total = l.entries.reduce((s, e) => s + e.amount, 0);
          const paid = l.entries.filter((e) => e.invoice?.status === "PAID").length;
          const open = l.entries.filter((e) => e.invoice && e.invoice.status !== "PAID").length;
          return (
            <Link key={l.id} href={`/attendance/${l.id}`} className="card-soft p-4 sm:p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase font-semibold text-amber-600">{l.clubYear.label}</div>
                  <h3 className="font-bold mt-1 break-words">{l.eventName}</h3>
                  {l.description && <p className="text-slate-500 text-xs italic mt-0.5 break-words">{l.description}</p>}
                  <p className="text-slate-500 text-sm mt-1">{formatDate(l.eventDate)} · {l.entries.length} Teilnehmer</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular whitespace-nowrap">{formatEUR(total)}</div>
                  <div className="text-xs text-slate-500 whitespace-nowrap">à {formatEUR(l.billPerHead)}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <span className="chip chip-paid">{paid} bezahlt</span>
                <span className="chip chip-open">{open} offen</span>
                {l.entries.filter((e) => !e.invoice).length > 0 && <span className="chip chip-cancelled">{l.entries.filter((e) => !e.invoice).length} ohne Rechnung</span>}
              </div>
            </Link>
          );
        })}
        {lists.length === 0 && <div className="card-soft p-10 text-center text-slate-500 sm:col-span-2 xl:col-span-3">Noch keine Teilnahmelisten erfasst.</div>}
      </div>
    </div>
  );
}