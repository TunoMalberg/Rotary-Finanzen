import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/clubyears/:id/close
 *
 * Schließt ein Clubjahr ab:
 *  1. Buchungs-Summary in `ArchivedYear` ablegen.
 *  2. Berechnet pro Konto den Endsaldo (Eröffnung + Bewegungen) und
 *     setzt den Eröffnungssaldo des Folgejahres entsprechend, sofern
 *     ein Folgejahr existiert. Damit ist die Saldo-Übernahme automatisch
 *     konsistent (vgl. /accounts).
 *  3. Markiert das Clubjahr als geschlossen.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  // Compute summary
  const txs = await prisma.transaction.findMany({
    where: { clubYearId: id, deletedAt: null },
    select: { amount: true, category: { select: { name: true, kind: true } } },
  });
  const income: Record<string, number> = {};
  const expense: Record<string, number> = {};
  for (const t of txs) {
    const c = t.category;
    if (!c) continue;
    if (t.amount > 0) income[c.name] = (income[c.name] ?? 0) + t.amount;
    else expense[c.name] = (expense[c.name] ?? 0) + Math.abs(t.amount);
  }

  // Endsaldo je Konto = Eröffnungssaldo + Σ Bewegungen
  const cy = await prisma.clubYear.findUnique({ where: { id } });
  if (!cy) return NextResponse.json({ error: "not found" }, { status: 404 });

  const accounts = await prisma.account.findMany();
  const closingByType: Record<string, number> = {};
  for (const acc of accounts) {
    const sum = await prisma.transaction.aggregate({
      where: { clubYearId: id, accountId: acc.id, deletedAt: null },
      _sum: { amount: true },
    });
    const opening = acc.type === "MAIN" ? cy.openingBalanceMain : cy.openingBalanceGG;
    closingByType[acc.type] = opening + (sum._sum.amount ?? 0);
  }

  // Folgejahr suchen (nächstes ClubYear nach startsAt) und Eröffnungssaldo setzen
  const next = await prisma.clubYear.findFirst({
    where: { startsAt: { gt: cy.startsAt } },
    orderBy: { startsAt: "asc" },
  });
  if (next) {
    await prisma.clubYear.update({
      where: { id: next.id },
      data: {
        openingBalanceMain: closingByType.MAIN ?? next.openingBalanceMain,
        openingBalanceGG: closingByType.GLOBAL_GRANT_TRUST ?? next.openingBalanceGG,
      },
    });
  }

  await prisma.clubYear.update({ where: { id }, data: { isClosed: true } });
  await prisma.archivedYear.upsert({
    where: { clubYearId: id },
    update: {
      summaryJson: JSON.stringify({ income, expense, closing: closingByType }),
      closedAt: new Date(),
      closedById: session?.user?.id,
    },
    create: {
      clubYearId: id,
      summaryJson: JSON.stringify({ income, expense, closing: closingByType }),
      closedById: session?.user?.id,
    },
  });
  return NextResponse.json({
    ok: true,
    closing: closingByType,
    nextOpeningSet: next ? { id: next.id, label: next.label } : null,
  });
}