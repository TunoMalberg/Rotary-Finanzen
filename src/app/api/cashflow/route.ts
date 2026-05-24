import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const e = await prisma.cashflowEntry.create({
    data: {
      clubYearId: body.clubYearId,
      date: new Date(body.date),
      label: body.label,
      amount: Number(body.amount),
      isPlanned: !!body.isPlanned,
      createdById: session?.user?.id,
    },
  });
  return NextResponse.json(e);
}