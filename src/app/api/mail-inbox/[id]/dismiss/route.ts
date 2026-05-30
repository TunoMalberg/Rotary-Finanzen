import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/mail-inbox/:id/dismiss
 *
 * Mail aus der Inbox entfernen (z. B. Spam, kein Beleg). Die Mail bleibt
 * in der DB, bekommt aber status=DISMISSED → erscheint nicht mehr in der
 * Inbox-Übersicht.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.mailInbox.update({
    where: { id },
    data: { status: "DISMISSED" },
  });
  return NextResponse.json({ ok: true });
}