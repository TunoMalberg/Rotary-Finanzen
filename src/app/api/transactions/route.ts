import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { checkClubYearMutable, ensureClubYearForDate } from "@/lib/clubYearLifecycle";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const txDate = new Date(body.date);
  if (isNaN(txDate.getTime())) return NextResponse.json({ error: "Ungültiges Datum" }, { status: 400 });

  // Das rotarische Clubjahr folgt IMMER dem Buchungsdatum (1.7.–30.6.).
  // Das im Formular gewählte Jahr wird ignoriert bzw. auf das Datum korrigiert,
  // fehlende (Folge-)Jahre werden automatisch mit Saldo-Übernahme angelegt.
  const cy = await ensureClubYearForDate(txDate);
  const guard = checkClubYearMutable(cy, { role: session?.user?.role, allowCorrection: !!body.allowCorrection });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const tx = await prisma.transaction.create({
    data: {
      accountId: body.accountId,
      clubYearId: cy.id,
      date: txDate,
      valueDate: body.valueDate ? new Date(body.valueDate) : null,
      counterparty: body.counterparty || null,
      purpose: body.purpose || null,
      note: body.note || null,
      code: body.code || null,
      amount: Number(body.amount),
      categoryId: body.categoryId || null,
      memberId: body.memberId || null,
      projectId: body.projectId || null,
      attachmentId: body.attachmentId || null,
      source: "MANUAL",
      createdById: session?.user?.id,
    },
  });
  // try to auto-match an open invoice
  if (body.memberId && body.amount > 0) {
    const inv = await prisma.invoice.findFirst({
      where: { memberId: body.memberId, clubYearId: cy.id, status: { in: ["OPEN", "REMINDED"] }, amount: Number(body.amount) },
    });
    if (inv) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date(), paidTransactionId: tx.id } });
    }
  }
  return NextResponse.json(tx);
}