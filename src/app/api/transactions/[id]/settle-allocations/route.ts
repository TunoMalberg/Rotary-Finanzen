import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/transactions/:id/settle-allocations
 *
 * Markiert alle über `TxAllocation` mit dieser (SEPA-)Sammelbuchung verknüpften
 * offenen Forderungen als bezahlt. Wird über den Button "Einzüge vornehmen"
 * auf der Buchungs-Detailseite ausgelöst – die SEPA-Import-Aktion legt nur
 * die Aufteilungen an, das Begleichen passiert hier explizit.
 *
 * Antwort: { settled: <Anzahl auf PAID gesetzter Forderungen>, skipped: ... }
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

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      allocations: {
        where: { invoiceId: { not: null } },
        include: { invoice: { select: { id: true, status: true } } },
      },
    },
  });
  if (!tx) {
    return NextResponse.json({ error: "Buchung nicht gefunden." }, { status: 404 });
  }

  let settled = 0;
  let alreadyPaid = 0;
  let withoutInvoice = 0;

  await prisma.$transaction(async (db) => {
    for (const a of tx.allocations) {
      if (!a.invoice) {
        withoutInvoice++;
        continue;
      }
      if (a.invoice.status === "PAID") {
        alreadyPaid++;
        continue;
      }
      await db.invoice.update({
        where: { id: a.invoice.id },
        data: {
          status: "PAID",
          paidAt: tx.date,
          paidTransactionId: tx.id,
        },
      });
      settled++;
    }
  });

  return NextResponse.json({
    settled,
    alreadyPaid,
    withoutInvoice,
    totalAllocations: tx.allocations.length,
  });
}