import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { autoCategoryName } from "@/lib/categorize";

/**
 * POST /api/accounts/reconcile/apply
 * Body JSON:
 *   accountId, clubYearId,
 *   addRows: [{date, counterparty, purpose, amount, externalRef, partnerIban, valueDate}]
 *   deleteIds: [transactionId, ...]
 *
 * Legt fehlende Buchungen aus dem Bank-File in der DB an und/oder
 * markiert überzählige Buchungen als gelöscht (soft-delete).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const accountId: string = body.accountId;
  const clubYearId: string = body.clubYearId;
  const addRows: Array<{
    date: string;
    counterparty: string | null;
    purpose: string | null;
    amount: number;
    externalRef: string | null;
    partnerIban: string | null;
    valueDate: string | null;
  }> = body.addRows ?? [];
  const deleteIds: string[] = body.deleteIds ?? [];

  if (!accountId || !clubYearId)
    return NextResponse.json({ error: "accountId/clubYearId fehlen" }, { status: 400 });

  const cats = await prisma.category.findMany();
  const catByName = new Map(cats.map((c) => [c.name, c.id]));
  const members = await prisma.member.findMany({ select: { id: true, lastName: true } });

  let created = 0;
  let deleted = 0;

  // Optional: einen Batch anlegen, damit man die manuell-ergänzten Zeilen
  // später wieder identifizieren kann.
  let batchId: string | null = null;
  if (addRows.length > 0) {
    const batch = await prisma.importBatch.create({
      data: {
        accountId,
        fileName: `Reconcile-Apply ${new Date().toISOString().slice(0, 19)}.json`,
        importedById: session?.user?.id,
        rowCount: addRows.length,
      },
    });
    batchId = batch.id;
  }

  for (const r of addRows) {
    const cat = autoCategoryName({
      purpose: r.purpose,
      counterparty: r.counterparty,
      code: r.partnerIban,
      amount: r.amount,
    });
    const categoryId = cat ? catByName.get(cat.name) ?? null : null;

    let memberId: string | null = null;
    const hay = `${r.counterparty ?? ""} ${r.purpose ?? ""}`.toLowerCase();
    for (const m of members) {
      if (m.lastName && hay.includes(m.lastName.toLowerCase())) {
        memberId = m.id;
        break;
      }
    }

    // Schutz vor Doppel-Import: nur überspringen wenn alle drei Felder
    // (externalRef + amount + purpose) übereinstimmen. Mehrere Zeilen
    // mit derselben Bank-Ref (z. B. Quartalsspesen) sind erlaubt.
    if (r.externalRef) {
      const exists = await prisma.transaction.findFirst({
        where: {
          accountId,
          externalRef: r.externalRef,
          amount: Number(r.amount),
          purpose: r.purpose,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (exists) continue;
    }
    await prisma.transaction.create({
      data: {
        accountId,
        clubYearId,
        date: new Date(r.date),
        valueDate: r.valueDate ? new Date(r.valueDate) : null,
        counterparty: r.counterparty,
        purpose: r.purpose,
        code: r.partnerIban,
        amount: Number(r.amount),
        categoryId,
        memberId,
        source: "IMPORT",
        importBatchId: batchId,
        externalRef: r.externalRef,
      },
    });
    created++;
  }

  if (deleteIds.length > 0) {
    const r = await prisma.transaction.updateMany({
      where: { id: { in: deleteIds } },
      data: { deletedAt: new Date() },
    });
    deleted = r.count;
  }

  return NextResponse.json({ created, deleted });
}