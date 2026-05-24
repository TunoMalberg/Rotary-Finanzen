import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const clubYearId = String(body.clubYearId);
  const cy = await prisma.clubYear.findUnique({ where: { id: clubYearId } });
  if (!cy) return NextResponse.json({ error: "no clubyear" }, { status: 400 });
  const members = await prisma.member.findMany({ where: { isExempt: false, status: "ACTIVE", duesAmount: { gt: 0 } } });
  const dueDate = new Date(cy.startsAt);
  dueDate.setUTCDate(dueDate.getUTCDate() + 60);
  let created = 0, skipped = 0;
  for (const m of members) {
    const reference = `MB-${cy.label.replace("/", "-")}-${m.rotaryMemberId ?? m.id.slice(0, 8)}`;
    const existing = await prisma.invoice.findUnique({ where: { reference } });
    if (existing) { skipped++; continue; }
    await prisma.invoice.create({
      data: {
        type: "DUES",
        memberId: m.id,
        clubYearId,
        dueDate,
        amount: m.duesAmount,
        reference,
        description: `Mitgliedsbeitrag Clubjahr ${cy.label}`,
        paymentMethod: m.paysBySEPA ? "SEPA" : "EMAIL_INVOICE",
      },
    });
    created++;
  }
  return NextResponse.json({ created, skipped });
}