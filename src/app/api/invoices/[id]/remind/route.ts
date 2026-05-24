import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const newLevel = inv.reminderLevel + 1;
  await prisma.invoice.update({
    where: { id },
    data: { reminderLevel: newLevel, lastReminderAt: new Date(), status: "REMINDED" },
  });
  await prisma.reminderLog.create({
    data: { invoiceId: id, level: newLevel, channel: "EMAIL", notes: "Mahn-Mail erzeugt" },
  });
  return NextResponse.json({ ok: true, level: newLevel });
}