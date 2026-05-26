import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { formatEUR } from "@/lib/format";
import { AttendanceListEditor } from "./AttendanceListEditor";

export const dynamic = "force-dynamic";

export default async function AttendanceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const list = await prisma.attendanceList.findUnique({
    where: { id },
    include: {
      clubYear: true,
      category: true,
      entries: {
        include: { member: true, invoice: true },
        orderBy: [{ member: { lastName: "asc" } }, { member: { firstName: "asc" } }],
      },
    },
  });
  if (!list) notFound();
  const isLocked = !!list.clubYear.lockedAt;
  const editable = canEdit && !isLocked;

  // Mitglieder-Auswahl für "Teilnehmer hinzufügen"
  const allMembers = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "NON_MEMBER"] } },
    orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, status: true, paysBySEPA: true },
  });
  const inListMemberIds = new Set(list.entries.map((e) => e.memberId));
  const availableMembers = allMembers
    .filter((m) => !inListMemberIds.has(m.id))
    .map((m) => ({
      id: m.id,
      name: `${m.lastName}, ${m.firstName}`,
      sepa: m.paysBySEPA,
      isGuest: m.status === "NON_MEMBER",
    }));

  const total = list.entries.reduce((s, e) => s + e.amount, 0);
  const totalPaid = list.entries.filter((e) => e.invoice?.status === "PAID").reduce((s, e) => s + e.amount, 0);
  const totalOpen = list.entries
    .filter((e) => e.invoice && e.invoice.status !== "PAID" && e.invoice.status !== "CANCELLED")
    .reduce((s, e) => s + e.amount, 0);
  const totalNoInv = list.entries.filter((e) => !e.invoice || e.invoice.status === "CANCELLED").length;

  return (
    <div className="space-y-5 fade-up">
      <AttendanceListEditor
        list={{
          id: list.id,
          eventName: list.eventName,
          eventDate: list.eventDate.toISOString(),
          description: list.description,
          billPerHead: list.billPerHead,
          paymentMethod: list.paymentMethod,
          clubYearLabel: list.clubYear.label,
          category: list.category ? { id: list.category.id, name: list.category.name } : null,
          entries: list.entries.map((e) => ({
            id: e.id,
            memberId: e.memberId,
            memberName: `${e.member.lastName}, ${e.member.firstName}`,
            memberEmail: e.member.email,
            memberStatus: e.member.status,
            memberPaysBySEPA: e.member.paysBySEPA,
            personCount: e.personCount,
            amount: e.amount,
            paymentOverride: e.paymentOverride,
            invoice: e.invoice
              ? {
                  id: e.invoice.id,
                  reference: e.invoice.reference,
                  status: e.invoice.status,
                  paymentMethod: e.invoice.paymentMethod,
                  amount: e.invoice.amount,
                  dueDate: e.invoice.dueDate.toISOString(),
                  reminderLevel: e.invoice.reminderLevel,
                }
              : null,
          })),
        }}
        editable={editable}
        availableMembers={availableMembers}
        summary={{ total, totalPaid, totalOpen, totalNoInv }}
      />
      {!editable && isLocked && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
          Clubjahr ist fixiert – diese Liste ist schreibgeschützt.
        </div>
      )}
      {!canEdit && (
        <div className="text-xs text-slate-500">Nur Schatzmeister/Admin können Auslagenprojekte bearbeiten.</div>
      )}
      <div className="text-xs text-slate-500">
        Gesamtsumme: <strong className="tabular">{formatEUR(total)}</strong>
      </div>
    </div>
  );
}