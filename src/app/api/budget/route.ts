import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const clubYearId = String(body.clubYearId);
  const lines = body.lines as { categoryId: string; amount: number }[];
  for (const l of lines) {
    await prisma.budgetLine.upsert({
      where: { clubYearId_categoryId: { clubYearId, categoryId: l.categoryId } },
      update: { amount: l.amount },
      create: { clubYearId, categoryId: l.categoryId, amount: l.amount },
    });
  }
  return NextResponse.json({ ok: true });
}