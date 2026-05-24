import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const list = await prisma.attendanceList.findUnique({
    where: { id },
    include: { entries: { include: { member: true } }, clubYear: true },
  });
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  const dueDate = new Date(list.eventDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);
  let created = 0;
  for (const e of list.entries) {
    if (e.invoiceId) continue;
    const reference = `EXP-${list.clubYear.label.replace("/", "-")}-${list.id.slice(0, 6)}-${e.member.rotaryMemberId ?? e.id.slice(0, 6)}`;
    const method = list.paymentMethod === "MIXED"
      ? (e.member.paysBySEPA ? "SEPA" : "EMAIL_INVOICE")
      : list.paymentMethod;
    const inv = await prisma.invoice.create({
      data: {
        type: "EXPENSE",
        memberId: e.memberId,
        clubYearId: list.clubYearId,
        dueDate,
        amount: e.amount,
        reference,
        description: `${list.eventName} – Teilnahmebeitrag`,
        paymentMethod: method,
      },
    });
    await prisma.attendanceEntry.update({ where: { id: e.id }, data: { invoiceId: inv.id } });
    created++;
  }
  return NextResponse.json({ created });
}