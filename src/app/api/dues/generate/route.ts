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
  // Beitrag nur für AKTIVE, nicht befreite Mitglieder mit Beitrag > 0.
  const members = await prisma.member.findMany({ where: { isExempt: false, status: "ACTIVE", duesAmount: { gt: 0 } } });

  // Fällig ab 1.7., zahlbar bis 30.9. des Clubjahres. Das Clubjahr startet am
  // 1.7. des Startjahres → Zahlungsziel = 30.9. desselben Jahres.
  const startYear = new Date(cy.startsAt).getUTCFullYear();
  const dueDate = new Date(Date.UTC(startYear, 8, 30, 23, 59, 59)); // Monat 8 = September

  let created = 0, skipped = 0, sepa = 0, invoice = 0;
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
    if (m.paysBySEPA) sepa++; else invoice++;
    created++;
  }
  // sepa   = per Einzug (EZ) – keine Rechnung nötig
  // invoice = per E-Mail-Rechnung – erhalten eine Rechnung per „Rechnungen versenden"
  return NextResponse.json({ created, skipped, sepa, invoice, dueDate: dueDate.toISOString() });
}