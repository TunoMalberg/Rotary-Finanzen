import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { sendMail, isEmailConfigured } from "@/lib/email";
import { buildDuesInvoiceEmail } from "@/lib/duesEmail";

export const dynamic = "force-dynamic";

/**
 * POST /api/dues/send-invoices  { clubYearId, force? }
 *
 * Versendet die Beitrags-Rechnung per E-Mail an ALLE Mitglieder OHNE
 * Einzugsermächtigung (EZ/SEPA). Grundlage sind die offenen DUES-Forderungen
 * des Clubjahres mit paymentMethod = EMAIL_INVOICE.
 *
 *  - SEPA-Forderungen (EZ) werden übersprungen (automatischer Einzug).
 *  - Bereits versendete Rechnungen werden übersprungen (idempotent),
 *    außer `force: true`.
 *  - Forderungen ohne E-Mail-Adresse werden gezählt und übersprungen.
 *
 * Nur Schatzmeister/Admin.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const clubYearId = String(body.clubYearId ?? "");
  const force = body.force === true;

  const cy = await prisma.clubYear.findUnique({ where: { id: clubYearId } });
  if (!cy) return NextResponse.json({ error: "no clubyear" }, { status: 400 });

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "E-Mail-Versand ist nicht konfiguriert (POSTMARK_SERVER_TOKEN / EMAIL_FROM fehlen)." },
      { status: 400 },
    );
  }

  // Nur offene E-Mail-Rechnungen (kein SEPA, keine bezahlten/stornierten).
  const invoices = await prisma.invoice.findMany({
    where: {
      clubYearId,
      type: "DUES",
      paymentMethod: "EMAIL_INVOICE",
      status: { in: ["OPEN", "REMINDED"] },
    },
    include: { member: true },
    orderBy: { member: { lastName: "asc" } },
  });

  let sent = 0;
  let alreadySent = 0;
  let noEmail = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const inv of invoices) {
    if (inv.invoiceSentAt && !force) {
      alreadySent++;
      continue;
    }
    const email = (inv.member.email ?? "").trim();
    if (!email) {
      noEmail++;
      continue;
    }

    const { subject, htmlBody, textBody } = buildDuesInvoiceEmail({
      memberName: `${inv.member.firstName} ${inv.member.lastName}`.trim(),
      salutation: inv.member.salutation,
      amount: inv.amount,
      reference: inv.reference,
      dueDate: inv.dueDate,
      clubYearLabel: cy.label,
    });

    const result = await sendMail({ to: email, subject, htmlBody, textBody });
    if (result.ok) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { invoiceSentAt: new Date() } });
      sent++;
    } else {
      failed++;
      failures.push(`${inv.member.lastName}, ${inv.member.firstName} (${result.error ?? "unbekannt"})`);
    }
  }

  return NextResponse.json({
    ok: true,
    total: invoices.length,
    sent,
    alreadySent,
    noEmail,
    failed,
    failures: failures.slice(0, 10),
  });
}