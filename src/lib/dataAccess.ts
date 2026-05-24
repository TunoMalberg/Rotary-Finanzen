import { prisma } from "./prisma";

export async function getCurrentClubYear() {
  const cy = await prisma.clubYear.findFirst({
    where: { isClosed: false },
    orderBy: { startsAt: "desc" },
  });
  if (cy) return cy;
  const fallback = await prisma.clubYear.findFirst({ orderBy: { startsAt: "desc" } });
  if (!fallback) throw new Error("Kein Clubjahr vorhanden – bitte seeden.");
  return fallback;
}

export async function getAccounts() {
  return prisma.account.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
}

export async function getAccountBalance(accountId: string, clubYearId: string) {
  const cy = await prisma.clubYear.findUnique({ where: { id: clubYearId } });
  if (!cy) return 0;
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return 0;
  const opening = account.type === "MAIN" ? cy.openingBalanceMain : cy.openingBalanceGG;
  const sum = await prisma.transaction.aggregate({
    where: {
      accountId,
      clubYearId,
      deletedAt: null,
    },
    _sum: { amount: true },
  });
  return opening + (sum._sum.amount ?? 0);
}

export async function getCategoryTotals(clubYearId: string, accountType?: "MAIN" | "GLOBAL_GRANT_TRUST") {
  const where: { clubYearId: string; deletedAt: null; account?: { type: "MAIN" | "GLOBAL_GRANT_TRUST" } } = {
    clubYearId,
    deletedAt: null,
  };
  if (accountType) where.account = { type: accountType };
  const txs = await prisma.transaction.findMany({
    where,
    select: { amount: true, category: { select: { id: true, name: true, kind: true, color: true, sortOrder: true } } },
  });
  const grouped = new Map<string, { id: string; name: string; kind: string; color: string; sortOrder: number; amount: number }>();
  for (const t of txs) {
    const c = t.category;
    const key = c?.id ?? "uncat";
    const cur = grouped.get(key);
    if (cur) cur.amount += t.amount;
    else grouped.set(key, {
      id: key,
      name: c?.name ?? "Ohne Kategorie",
      kind: c?.kind ?? "NEUTRAL",
      color: c?.color ?? "#888",
      sortOrder: c?.sortOrder ?? 999,
      amount: t.amount,
    });
  }
  return [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}