import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { formatDate, formatEUR } from "@/lib/format";
import { IssueInvoicesBtn } from "./IssueInvoicesBtn";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AttendanceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const list = await prisma.attendanceList.findUnique({
    where: { id },
    include: {
      clubYear: true,
      entries: {
        include: { member: true, invoice: true },
        orderBy: { member: { lastName: "asc" } },
      },
    },
  });
  if (!list) notFound();
  const total = list.entries.reduce((s, e) => s + e.amount, 0);
  const totalPaid = list.entries.filter((e) => e.invoice?.status === "PAID").reduce((s, e) => s + e.amount, 0);
  const totalOpen = list.entries.filter((e) => e.invoice && e.invoice.status !== "PAID").reduce((s, e) => s + e.amount, 0);
  const totalNoInv = list.entries.filter((e) => !e.invoice).length;

  return (
    <div className="space-y-5 fade-up">
      <header>
        <div className="text-xs uppercase tracking-widest text-amber-600">Teilnahmeliste · {list.clubYear.label}</div>
        <h1 className="text-2xl font-bold mt-1">{list.eventName}</h1>
        <p className="text-slate-500 text-sm">{formatDate(list.eventDate)} · {list.entries.length} Teilnehmer · {formatEUR(list.billPerHead)} pro Person · gesamt {formatEUR(total)}</p>
      </header>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card-soft p-4"><div className="text-xs uppercase text-slate-500">Bezahlt</div><div className="text-xl font-bold mt-1 amount-pos tabular">{formatEUR(totalPaid)}</div></div>
        <div className="card-soft p-4"><div className="text-xs uppercase text-slate-500">Offen</div><div className="text-xl font-bold mt-1 amount-neg tabular">{formatEUR(totalOpen)}</div></div>
        <div className="card-soft p-4"><div className="text-xs uppercase text-slate-500">Ohne Rechnung</div><div className="text-xl font-bold mt-1 tabular">{totalNoInv}</div></div>
      </div>

      {canEdit && totalNoInv > 0 && <IssueInvoicesBtn listId={list.id} />}

      <div className="card-soft overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mitglied</th>
              <th>Methode</th>
              <th>Status</th>
              <th>Referenz</th>
              <th className="text-right">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {list.entries.map((e) => (
              <tr key={e.id}>
                <td className="font-medium">
                  <Link href={`/members/${e.memberId}`} className="hover:text-blue-700">{e.member.lastName}, {e.member.firstName}</Link>
                </td>
                <td>{e.invoice ? <span className={`chip ${e.invoice.paymentMethod === "SEPA" ? "chip-sepa" : "chip-invoice"}`}>{e.invoice.paymentMethod === "SEPA" ? "EZ" : "Rechnung"}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                <td>{e.invoice ? <span className={`chip chip-${e.invoice.status.toLowerCase()}`}>{statusDe(e.invoice.status)}</span> : <span className="chip chip-cancelled">Ohne Rg.</span>}</td>
                <td className="font-mono text-xs">{e.invoice?.reference ?? "—"}</td>
                <td className="text-right font-mono tabular">{formatEUR(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function statusDe(s: string) { return s === "OPEN" ? "Offen" : s === "PAID" ? "Bezahlt" : s === "REMINDED" ? "Gemahnt" : s; }