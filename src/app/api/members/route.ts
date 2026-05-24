import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const m = await prisma.member.create({
    data: {
      rotaryMemberId: body.rotaryMemberId ? Number(body.rotaryMemberId) : null,
      lastName: body.lastName,
      firstName: body.firstName,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      postalCode: body.postalCode || null,
      country: body.country || "Austria",
      paysBySEPA: !!body.paysBySEPA,
      isExempt: !!body.isExempt,
      duesAmount: body.duesAmount ?? 580,
      status: body.status || "ACTIVE",
    },
  });
  return NextResponse.json(m);
}