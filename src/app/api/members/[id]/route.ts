import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const data = {
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
    duesAmount: Number(body.duesAmount) || 0,
    status: body.status || "ACTIVE",
    notes: body.notes || null,
  };
  const m = await prisma.member.update({ where: { id }, data });
  return NextResponse.json(m);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.member.update({ where: { id }, data: { status: "INACTIVE", leftAt: new Date() } });
  return NextResponse.json({ ok: true });
}