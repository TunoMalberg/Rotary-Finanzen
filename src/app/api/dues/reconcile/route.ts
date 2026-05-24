import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const clubYearId = String(body.clubYearId);
  const open = await prisma.invoice.findMany({
    where: { clubYearId, status: { in: ["OPEN", "REMINDED"] } },
    include: { member: true },
  });
  let matched = 0;
  for (const inv of open) {
    // Try transaction match: member + amount + clubYear, no other invoice paid
    const tx = await prisma.transaction.findFirst({
      where: {
        clubYearId,
        memberId: inv.memberId,
        amount: inv.amount,
        deletedAt: null,
        invoicePaid: null,
      },
    });
    if (tx) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: "PAID", paidAt: tx.date, paidTransactionId: tx.id },
      });
      matched++;
    }
  }
  return NextResponse.json({ matched });
}