import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/invoices/:id/reopen
 *
 * Setzt eine als „bezahlt" markierte Forderung wieder in „offen" zurück –
 * z. B. wenn ein SEPA-Einzug zurückgebucht wurde und der Mitgliedsbeitrag
 * doch nicht eingelangt ist. Auch für Auslagen-/Erstattungsforderungen
 * (type=EXPENSE) verwendbar.
 *
 * - Status wird auf "REMINDED" gesetzt, falls reminderLevel > 0, sonst "OPEN".
 * - paidAt + paidTransactionId werden gelöscht.
 * - Eventuelle Buchungs-Allocations zur ursprünglichen Zahlungstransaktion
 *   werden ebenfalls entfernt, damit die Buchung nicht weiterhin als
 *   „aufgeteilt" auf diese Forderung erscheint.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (invoice.status !== "PAID") {
    return NextResponse.json(
      { error: "invoice_not_paid", message: "Forderung ist nicht als bezahlt markiert." },
      { status: 400 },
    );
  }

  const newStatus = invoice.reminderLevel > 0 ? "REMINDED" : "OPEN";

  await prisma.$transaction([
    // Allocations dieser Invoice entfernen (z. B. SEPA-Sammelbuchung)
    prisma.txAllocation.deleteMany({ where: { invoiceId: id } }),
    // Forderung wieder öffnen
    prisma.invoice.update({
      where: { id },
      data: {
        status: newStatus,
        paidAt: null,
        paidTransactionId: null,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, status: newStatus });
}