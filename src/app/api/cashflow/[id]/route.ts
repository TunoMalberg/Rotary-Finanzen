import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await prisma.cashflowEntry.delete({ where: { id } });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2025")
      return NextResponse.json({ error: "not found" }, { status: 404 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}