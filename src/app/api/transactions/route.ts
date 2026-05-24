import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const tx = await prisma.transaction.create({
    data: {
      accountId: body.accountId,
      clubYearId: body.clubYearId,
      date: new Date(body.date),
      valueDate: body.valueDate ? new Date(body.valueDate) : null,
      counterparty: body.counterparty || null,
      purpose: body.purpose || null,
      note: body.note || null,
      code: body.code || null,
      amount: Number(body.amount),
      categoryId: body.categoryId || null,
      memberId: body.memberId || null,
      attachmentId: body.attachmentId || null,
      source: "MANUAL",
      createdById: session?.user?.id,
    },
  });
  // try to auto-match an open invoice
  if (body.memberId && body.amount > 0) {
    const inv = await prisma.invoice.findFirst({
      where: { memberId: body.memberId, clubYearId: body.clubYearId, status: { in: ["OPEN", "REMINDED"] }, amount: Number(body.amount) },
    });
    if (inv) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date(), paidTransactionId: tx.id } });
    }
  }
  return NextResponse.json(tx);
}