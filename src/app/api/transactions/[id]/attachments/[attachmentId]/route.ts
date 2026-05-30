import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { deleteBlob } from "@/lib/blobStorage";

/**
 * DELETE /api/transactions/:id/attachments/:attachmentId
 *
 * Entfernt die Verknüpfung zwischen Buchung und Beleg (TransactionAttachment).
 * Wenn der Beleg an keiner anderen Buchung mehr hängt, wird auch das
 * Attachment + der Blob gelöscht.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id: txId, attachmentId } = await ctx.params;

  const link = await prisma.transactionAttachment.findUnique({
    where: { transactionId_attachmentId: { transactionId: txId, attachmentId } },
  });
  if (!link) return NextResponse.json({ error: "not linked" }, { status: 404 });

  await prisma.transactionAttachment.delete({
    where: { transactionId_attachmentId: { transactionId: txId, attachmentId } },
  });

  // Beleg an anderen Buchungen noch verknüpft?
  const remainingLinks = await prisma.transactionAttachment.count({
    where: { attachmentId },
  });
  const legacyTxLinks = await prisma.transaction.count({
    where: { attachmentId },
  });
  if (remainingLinks === 0 && legacyTxLinks === 0) {
    const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (att) {
      await deleteBlob(att.storagePath);
      await prisma.attachment.delete({ where: { id: attachmentId } });
    }
  }
  return NextResponse.json({ ok: true });
}