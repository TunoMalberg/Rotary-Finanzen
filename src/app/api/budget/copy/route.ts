import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { sourceYearId, targetYearId } = await req.json();
  const src = await prisma.budgetLine.findMany({ where: { clubYearId: sourceYearId } });
  for (const s of src) {
    await prisma.budgetLine.upsert({
      where: { clubYearId_categoryId: { clubYearId: targetYearId, categoryId: s.categoryId } },
      update: { amount: s.amount },
      create: { clubYearId: targetYearId, categoryId: s.categoryId, amount: s.amount },
    });
  }
  return NextResponse.json({ ok: true, count: src.length });
}