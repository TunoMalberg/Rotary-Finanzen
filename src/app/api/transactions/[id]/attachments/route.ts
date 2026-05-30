import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { uploadBlob } from "@/lib/blobStorage";
import { simpleParser } from "mailparser";

export const maxDuration = 60;

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB pro Datei
const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "message/rfc822", // .eml
  "application/vnd.ms-outlook", // .msg
  "application/octet-stream", // Browser-Fallback für .eml
  "text/plain",
]);

function inferKind(mime: string, fileName: string): string {
  if (mime === "message/rfc822" || /\.eml$/i.test(fileName)) return "EMAIL";
  if (mime === "application/vnd.ms-outlook" || /\.msg$/i.test(fileName)) return "EMAIL";
  if (mime === "application/pdf") return "INVOICE";
  if (mime.startsWith("image/")) return "RECEIPT";
  return "OTHER";
}

/**
 * POST /api/transactions/:id/attachments
 *
 * Multipart-Upload eines oder mehrerer Belege. Felder:
 *   - files: File[] (multiple erlaubt)
 *
 * Bei .eml-Dateien wird zusätzlich ein MailInbox-Datensatz angelegt
 * (Sender, Betreff, Body), damit der Prüfer die Original-Mail einsehen kann.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id: txId } = await ctx.params;

  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    select: { id: true },
  });
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });

  const fd = await req.formData();
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Keine Dateien." }, { status: 400 });
  }

  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const created: { id: string; fileName: string; kind: string; mailInboxId: string | null }[] = [];

  for (const file of files) {
    if (file.size === 0) continue;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Datei ${file.name} ist größer als ${MAX_SIZE / 1024 / 1024} MB.` },
        { status: 413 },
      );
    }
    const mime = file.type || "application/octet-stream";
    const isEml =
      mime === "message/rfc822" ||
      /\.eml$/i.test(file.name) ||
      mime === "text/plain";
    if (!ALLOWED.has(mime) && !isEml) {
      return NextResponse.json(
        { error: `Dateityp ${mime} (${file.name}) nicht erlaubt.` },
        { status: 415 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const kind = inferKind(mime, file.name);

    // Wenn .eml: Mailinhalt parsen, MailInbox-Datensatz anlegen + alle
    // enthaltenen Anhänge ebenfalls als eigene Attachments speichern.
    let mailInboxId: string | null = null;
    if (kind === "EMAIL" && (mime === "message/rfc822" || /\.eml$/i.test(file.name))) {
      try {
        const parsed = await simpleParser(buf);
        const fromObj = parsed.from?.value?.[0];
        const inbox = await prisma.mailInbox.create({
          data: {
            source: "UPLOAD",
            fromAddress: fromObj?.address ?? "(unbekannt)",
            fromName: fromObj?.name ?? null,
            toAddress: Array.isArray(parsed.to)
              ? parsed.to[0]?.value?.[0]?.address ?? null
              : parsed.to?.value?.[0]?.address ?? null,
            subject: parsed.subject ?? null,
            receivedAt: parsed.date ?? new Date(),
            textBody: parsed.text ?? null,
            htmlBody: typeof parsed.html === "string" ? parsed.html : null,
            messageId: parsed.messageId ?? null,
            status: "MATCHED",
            matchedTxId: txId,
            matchedAt: new Date(),
            matchedById: userId,
          },
        });
        mailInboxId = inbox.id;

        // Original-.eml als Attachment speichern und mit MailInbox verknüpfen
        const stored = await uploadBlob({
          fileName: file.name,
          mimeType: "message/rfc822",
          data: buf,
          keyPrefix: `mails/${inbox.id}/`,
        });
        const att = await prisma.attachment.create({
          data: {
            fileName: file.name,
            mimeType: "message/rfc822",
            sizeBytes: stored.sizeBytes,
            storagePath: stored.storagePath,
            kind: "EMAIL",
            uploadedById: userId,
            mailInboxId: inbox.id,
          },
        });
        await prisma.transactionAttachment.create({
          data: {
            transactionId: txId,
            attachmentId: att.id,
            source: "MAIL_MANUAL",
            linkedById: userId,
          },
        });
        created.push({ id: att.id, fileName: att.fileName, kind: "EMAIL", mailInboxId });

        // Mail-Anhänge (PDFs, Bilder) als eigene Attachments
        for (const a of parsed.attachments ?? []) {
          if (!a.content || a.content.length === 0) continue;
          const aMime = a.contentType || "application/octet-stream";
          if (!ALLOWED.has(aMime) && !aMime.startsWith("image/")) continue;
          const aName = a.filename || `anhang.${aMime.split("/").pop() ?? "bin"}`;
          const aStored = await uploadBlob({
            fileName: aName,
            mimeType: aMime,
            data: a.content,
            keyPrefix: `mails/${inbox.id}/`,
          });
          const aAtt = await prisma.attachment.create({
            data: {
              fileName: aName,
              mimeType: aMime,
              sizeBytes: aStored.sizeBytes,
              storagePath: aStored.storagePath,
              kind: inferKind(aMime, aName),
              uploadedById: userId,
              mailInboxId: inbox.id,
            },
          });
          await prisma.transactionAttachment.create({
            data: {
              transactionId: txId,
              attachmentId: aAtt.id,
              source: "MAIL_MANUAL",
              linkedById: userId,
            },
          });
          created.push({
            id: aAtt.id,
            fileName: aAtt.fileName,
            kind: aAtt.kind,
            mailInboxId,
          });
        }
        continue;
      } catch (e) {
        console.warn("[attachments] eml parsing failed, falling back", e);
      }
    }

    // Normaler Datei-Upload (PDF, Bild, …)
    const stored = await uploadBlob({
      fileName: file.name,
      mimeType: mime,
      data: buf,
      keyPrefix: "attachments/",
    });
    const att = await prisma.attachment.create({
      data: {
        fileName: file.name,
        mimeType: mime,
        sizeBytes: stored.sizeBytes,
        storagePath: stored.storagePath,
        kind,
        uploadedById: userId,
      },
    });
    await prisma.transactionAttachment.create({
      data: {
        transactionId: txId,
        attachmentId: att.id,
        source: "UPLOAD",
        linkedById: userId,
      },
    });
    created.push({ id: att.id, fileName: att.fileName, kind, mailInboxId: null });
  }

  return NextResponse.json({ created });
}