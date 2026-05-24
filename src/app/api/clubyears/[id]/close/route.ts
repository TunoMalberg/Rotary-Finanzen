import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  // Compute summary
  const txs = await prisma.transaction.findMany({
    where: { clubYearId: id, deletedAt: null },
    select: { amount: true, category: { select: { name: true, kind: true } } },
  });
  const income: Record<string, number> = {}, expense: Record<string, number> = {};
  for (const t of txs) {
    const c = t.category;
    if (!c) continue;
    if (t.amount > 0) income[c.name] = (income[c.name] ?? 0) + t.amount;
    else expense[c.name] = (expense[c.name] ?? 0) + Math.abs(t.amount);
  }
  await prisma.clubYear.update({ where: { id }, data: { isClosed: true } });
  await prisma.archivedYear.upsert({
    where: { clubYearId: id },
    update: { summaryJson: JSON.stringify({ income, expense }), closedAt: new Date(), closedById: session?.user?.id },
    create: { clubYearId: id, summaryJson: JSON.stringify({ income, expense }), closedById: session?.user?.id },
  });
  return NextResponse.json({ ok: true });
}