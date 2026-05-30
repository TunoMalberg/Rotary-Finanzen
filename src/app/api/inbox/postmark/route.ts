import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadBlob } from "@/lib/blobStorage";
import {
  extractInvoiceFromPdf,
  extractInvoiceFromText,
  type ExtractedInvoice,
} from "@/lib/invoiceExtract";
import { findMatchCandidates, shouldAutoLink } from "@/lib/mailMatch";

export const maxDuration = 60;

/**
 * POST /api/inbox/postmark
 *
 * Webhook-Empfänger für eingehende Mails (Postmark Inbound).
 * Konfigurations-Hinweise siehe `specs/email-inbox/document.md`.
 *
 * Auth: HTTP-Basic. Postmark trägt die Header automatisch, wenn in der
 * Inbound-Server-Konfiguration "Webhook authentication" auf Basic gesetzt
 * ist. Wir prüfen gegen ENV `POSTMARK_INBOUND_USER` + `POSTMARK_INBOUND_PASSWORD`.
 *
 * Verarbeitung:
 *  1. Mail + alle Anhänge in Vercel-Blob ablegen (raw .eml-Reproduktion +
 *     je ein Attachment pro Anhang).
 *  2. Aus Mail-Body + PDFs Brutto-Betrag, IBAN, Rechnungs-Nr. extrahieren.
 *  3. Match-Heuristik gegen offene Bank-Buchungen → bei Score ≥ 0.85 +
 *     eindeutigem Top-Treffer Auto-Link, sonst MailInbox = UNMATCHED.
 *  4. Antwort 200 (Postmark wiederholt sonst).
 */
export async function POST(req: Request) {
  // ------- Auth -------
  const expectedUser = process.env.POSTMARK_INBOUND_USER;
  const expectedPass = process.env.POSTMARK_INBOUND_PASSWORD;
  if (!expectedUser || !expectedPass) {
    console.error("[postmark] missing POSTMARK_INBOUND_USER/PASSWORD");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Basic\s+(.+)$/);
  if (!m) return NextResponse.json({ error: "auth" }, { status: 401 });
  const decoded = Buffer.from(m[1], "base64").toString("utf-8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return NextResponse.json({ error: "auth" }, { status: 401 });
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  if (user !== expectedUser || pass !== expectedPass) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  // ------- Payload -------
  let body: PostmarkInboundPayload;
  try {
    body = (await req.json()) as PostmarkInboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const messageId = body.MessageID ?? null;
  if (messageId) {
    const dup = await prisma.mailInbox.findUnique({ where: { messageId } });
    if (dup) {
      // Idempotent: Postmark retry → einfach OK.
      return NextResponse.json({ ok: true, deduped: true, mailInboxId: dup.id });
    }
  }

  const fromObj = body.FromFull ?? { Email: body.From ?? "(unbekannt)", Name: "" };
  const receivedAt = body.Date ? new Date(body.Date) : new Date();

  // 1. MailInbox-Datensatz anlegen
  const inbox = await prisma.mailInbox.create({
    data: {
      source: "POSTMARK",
      fromAddress: fromObj.Email,
      fromName: fromObj.Name || null,
      toAddress: body.OriginalRecipient ?? body.To ?? null,
      subject: body.Subject ?? null,
      receivedAt,
      textBody: body.TextBody ?? null,
      htmlBody: body.HtmlBody ?? null,
      messageId,
      status: "UNMATCHED",
    },
  });

  // 2. Anhänge speichern (PDFs + Bilder)
  const pdfBuffers: Buffer[] = [];
  for (const a of body.Attachments ?? []) {
    if (!a.Content || !a.Name) continue;
    const buf = Buffer.from(a.Content, "base64");
    if (buf.length === 0) continue;
    const mime = a.ContentType || "application/octet-stream";
    const stored = await uploadBlob({
      fileName: a.Name,
      mimeType: mime,
      data: buf,
      keyPrefix: `mails/${inbox.id}/`,
    });
    const kind =
      mime === "application/pdf"
        ? "INVOICE"
        : mime.startsWith("image/")
          ? "RECEIPT"
          : "OTHER";
    await prisma.attachment.create({
      data: {
        fileName: a.Name,
        mimeType: mime,
        sizeBytes: stored.sizeBytes,
        storagePath: stored.storagePath,
        kind,
        mailInboxId: inbox.id,
      },
    });
    if (mime === "application/pdf") pdfBuffers.push(buf);
  }

  // 3. Schlüssel-Felder extrahieren (PDFs zuerst, sonst Mail-Body)
  let extracted: ExtractedInvoice = { amount: null, iban: null, invoiceNumber: null };
  for (const buf of pdfBuffers) {
    const e = await extractInvoiceFromPdf(buf);
    if (e.amount != null) {
      extracted = e;
      break;
    }
    if (extracted.amount == null) extracted = e;
  }
  if (extracted.amount == null) {
    const mailText = `${body.Subject ?? ""}\n${body.TextBody ?? ""}`;
    const e2 = extractInvoiceFromText(mailText);
    if (e2.amount != null) extracted = e2;
    else {
      // wenigstens IBAN und Rechnungs-Nr. ergänzen, falls leer
      if (!extracted.iban && e2.iban) extracted.iban = e2.iban;
      if (!extracted.invoiceNumber && e2.invoiceNumber)
        extracted.invoiceNumber = e2.invoiceNumber;
    }
  }

  // 4. Match-Kandidaten
  const candidates = await findMatchCandidates({
    amount: extracted.amount,
    iban: extracted.iban,
    invoiceNumber: extracted.invoiceNumber,
    fromAddress: fromObj.Email,
    fromName: fromObj.Name || null,
    receivedAt,
  });
  const auto = shouldAutoLink(candidates);

  await prisma.mailInbox.update({
    where: { id: inbox.id },
    data: {
      extractedAmount: extracted.amount,
      extractedIban: extracted.iban,
      extractedInvNo: extracted.invoiceNumber,
      ...(auto
        ? {
            status: "MATCHED",
            matchedTxId: auto.transactionId,
            matchedAt: new Date(),
            matchConfidence: auto.score,
          }
        : {}),
    },
  });

  // 5. Wenn auto-matched: alle Anhänge der Mail an die Buchung verknüpfen
  if (auto) {
    const atts = await prisma.attachment.findMany({
      where: { mailInboxId: inbox.id },
      select: { id: true },
    });
    if (atts.length > 0) {
      await prisma.transactionAttachment.createMany({
        data: atts.map((a) => ({
          transactionId: auto.transactionId,
          attachmentId: a.id,
          source: "MAIL_AUTO",
        })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mailInboxId: inbox.id,
    extracted,
    matched: auto
      ? { transactionId: auto.transactionId, score: auto.score, reasons: auto.reasons }
      : null,
    candidates: candidates.slice(0, 3),
  });
}

/* -------------------- Postmark Payload (subset) -------------------- */

type PostmarkInboundAttachment = {
  Name: string;
  Content: string; // base64
  ContentType: string;
  ContentLength: number;
};

type PostmarkInboundPayload = {
  From?: string;
  FromFull?: { Email: string; Name: string };
  To?: string;
  ToFull?: { Email: string; Name: string }[];
  OriginalRecipient?: string;
  Subject?: string;
  MessageID?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: PostmarkInboundAttachment[];
};