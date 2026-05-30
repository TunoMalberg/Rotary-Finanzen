import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/mail-inbox/:id/assign
 * Body: { transactionId }
 *
 * Verknüpft eine ungematchte Mail mit einer bestehenden Buchung. Alle
 * Anhänge der Mail (PDFs, Bilder) werden als TransactionAttachment
 * (source=MAIL_MANUAL) angehängt. Die Mail bekommt status=MATCHED.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id: mailId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { transactionId?: string };
  if (!body.transactionId) {
    return NextResponse.json({ error: "transactionId fehlt" }, { status: 400 });
  }

  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const tx = await prisma.transaction.findUnique({
    where: { id: body.transactionId },
    select: { id: true },
  });
  if (!tx) return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 });

  const inbox = await prisma.mailInbox.findUnique({
    where: { id: mailId },
    include: { attachments: { select: { id: true } } },
  });
  if (!inbox) return NextResponse.json({ error: "Mail nicht gefunden" }, { status: 404 });

  await prisma.$transaction(async (db) => {
    if (inbox.attachments.length > 0) {
      await db.transactionAttachment.createMany({
        data: inbox.attachments.map((a) => ({
          transactionId: tx.id,
          attachmentId: a.id,
          source: "MAIL_MANUAL",
          linkedById: userId,
        })),
        skipDuplicates: true,
      });
    }
    await db.mailInbox.update({
      where: { id: mailId },
      data: {
        status: "MATCHED",
        matchedTxId: tx.id,
        matchedAt: new Date(),
        matchedById: userId,
      },
    });
  });

  return NextResponse.json({ ok: true, matchedTxId: tx.id });
}