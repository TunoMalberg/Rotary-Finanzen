import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { resolvePaymentMethod } from "@/lib/attendanceHelpers";

/**
 * POST /api/attendance/[id]/issue-invoices
 *
 * Erzeugt für alle Entries ohne Invoice eine `Invoice` (type=EXPENSE).
 *  - amount = AttendanceEntry.amount (= personCount * billPerHead, ggf. manueller Override)
 *  - paymentMethod: AttendanceEntry.paymentOverride > Listen-Default
 *    > MIXED-Auflösung gemäss Member.paysBySEPA
 *  - Reference: EXP-<clubYear>-<list6>-<rotaryId|entry6>
 *  - description: Listen-Name + ggf. Listen-Beschreibung + Personenzahl
 *  - dueDate: eventDate + 30 Tage
 *
 * Idempotent: bereits verknüpfte Entries werden nicht erneut bearbeitet.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const list = await prisma.attendanceList.findUnique({
    where: { id },
    include: { entries: { include: { member: true, invoice: true } }, clubYear: true },
  });
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (list.clubYear.lockedAt) {
    return NextResponse.json({ error: "Clubjahr fixiert – nicht editierbar" }, { status: 409 });
  }

  const dueDate = new Date(list.eventDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);

  let created = 0;
  let reactivated = 0;
  for (const e of list.entries) {
    const method = resolvePaymentMethod(list.paymentMethod, e.paymentOverride, e.member);
    const personLabel = e.personCount > 1 ? ` (${e.personCount} Personen)` : "";
    const description =
      `${list.eventName} – Teilnahmebeitrag${personLabel}` +
      (list.description ? ` – ${list.description}` : "");

    if (e.invoiceId && e.invoice) {
      // Bereits verknüpfte Invoice ggf. wiederbeleben (CANCELLED → OPEN) und Betrag/Beschreibung syncen.
      if (e.invoice.status === "CANCELLED") {
        await prisma.invoice.update({
          where: { id: e.invoice.id },
          data: { status: "OPEN", amount: e.amount, description, paymentMethod: method, dueDate },
        });
        reactivated++;
      }
      continue;
    }

    const reference = `EXP-${list.clubYear.label.replace("/", "-")}-${list.id.slice(0, 6)}-${e.member.rotaryMemberId ?? e.id.slice(0, 6)}`;
    const inv = await prisma.invoice.create({
      data: {
        type: "EXPENSE",
        memberId: e.memberId,
        clubYearId: list.clubYearId,
        dueDate,
        amount: e.amount,
        reference,
        description,
        paymentMethod: method,
      },
    });
    await prisma.attendanceEntry.update({ where: { id: e.id }, data: { invoiceId: inv.id } });
    created++;
  }
  return NextResponse.json({ created, reactivated });
}