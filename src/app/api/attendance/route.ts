import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const list = await prisma.attendanceList.create({
    data: {
      eventName: body.eventName,
      eventDate: new Date(body.eventDate),
      billPerHead: Number(body.billPerHead),
      paymentMethod: body.paymentMethod,
      clubYearId: body.clubYearId,
      entries: {
        create: (body.memberIds as string[]).map((memberId) => ({
          memberId,
          amount: Number(body.billPerHead),
        })),
      },
    },
  });
  return NextResponse.json({ id: list.id });
}