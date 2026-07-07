import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { sendMail, isEmailConfigured } from "@/lib/email";
import { buildDuesInvoiceEmail } from "@/lib/duesEmail";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/:id/send-invoice
 *
 * Versendet die Beitrags-Rechnung per E-Mail an EIN Mitglied (Einzelversand).
 * Setzt invoiceSentAt. Nur Schatzmeister/Admin.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "E-Mail-Versand ist nicht konfiguriert (POSTMARK_SERVER_TOKEN / EMAIL_FROM fehlen)." },
      { status: 400 },
    );
  }

  const inv = await prisma.invoice.findUnique({ where: { id }, include: { member: true, clubYear: true } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (inv.paymentMethod === "SEPA") {
    return NextResponse.json(
      { error: "Mitglied zahlt per Einzug (EZ) – keine Rechnung erforderlich." },
      { status: 409 },
    );
  }
  const email = (inv.member.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "Mitglied hat keine E-Mail-Adresse hinterlegt." }, { status: 409 });

  const { subject, htmlBody, textBody } = buildDuesInvoiceEmail({
    memberName: `${inv.member.firstName} ${inv.member.lastName}`.trim(),
    salutation: inv.member.salutation,
    amount: inv.amount,
    reference: inv.reference,
    dueDate: inv.dueDate,
    clubYearLabel: inv.clubYear.label,
  });

  const result = await sendMail({ to: email, subject, htmlBody, textBody });
  if (!result.ok) {
    return NextResponse.json({ error: `Versand fehlgeschlagen (${result.error ?? "unbekannt"}).` }, { status: 502 });
  }
  await prisma.invoice.update({ where: { id }, data: { invoiceSentAt: new Date() } });
  return NextResponse.json({ ok: true });
}