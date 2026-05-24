import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { label } = await req.json();
  if (!/^\d{4}\/\d{4}$/.test(label)) return NextResponse.json({ error: "Format YYYY/YYYY erwartet" }, { status: 400 });
  const [a, b] = label.split("/").map(Number);
  if (b !== a + 1) return NextResponse.json({ error: "Jahre nicht aufeinanderfolgend" }, { status: 400 });
  const existing = await prisma.clubYear.findUnique({ where: { label } });
  if (existing) return NextResponse.json({ error: "Bereits vorhanden" }, { status: 409 });
  const cy = await prisma.clubYear.create({
    data: {
      label,
      startsAt: new Date(Date.UTC(a, 7, 1)),
      endsAt: new Date(Date.UTC(b, 6, 31, 23, 59, 59)),
    },
  });
  return NextResponse.json(cy);
}