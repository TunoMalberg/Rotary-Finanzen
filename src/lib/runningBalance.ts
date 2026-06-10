/**
 * Laufende Saldoberechnung pro Konto.
 *
 * Liefert für jede Transaction den Saldo NACH dieser Buchung – berechnet
 * je Konto+Clubjahr-isoliert:
 *
 *    saldo(tx) = openingBalance(tx.clubYear, tx.account.type)
 *              + Σ (alle Buchungen dieses Jahres + Kontos
 *                   bis einschließlich tx, chronologisch)
 *
 * Damit ist der Saldo innerhalb eines Jahres immer konsistent zum
 * Eröffnungssaldo, unabhängig davon ob die Jahres-Übernahme zum Vorjahr
 * korrekt ist (das wird separat im Konto-Audit geprüft).
 */
import { prisma } from "./prisma";

export type RunningBalanceMap = Map<string, number>;

/**
 * Berechnet den laufenden Saldo nach jeder Buchung für ALLE Buchungen
 * der angegebenen Konten + Clubjahre. Liefert Map<txId → saldoNachBuchung>.
 *
 * Optimiert: EINE Transaction-Query (statt N×M), Account-/Year-Lookups
 * parallel; In-Memory-Partitionierung nach (accountId, clubYearId).
 */
export async function computeRunningBalances(params: {
  accountIds: string[];
  clubYearIds: string[];
}): Promise<RunningBalanceMap> {
  const result: RunningBalanceMap = new Map();
  if (params.accountIds.length === 0 || params.clubYearIds.length === 0) return result;

  const [accounts, years, txs] = await Promise.all([
    prisma.account.findMany({
      where: { id: { in: params.accountIds } },
      select: { id: true, type: true },
    }),
    prisma.clubYear.findMany({
      where: { id: { in: params.clubYearIds } },
      select: { id: true, openingBalanceMain: true, openingBalanceGG: true },
    }),
    prisma.transaction.findMany({
      where: {
        accountId: { in: params.accountIds },
        clubYearId: { in: params.clubYearIds },
        deletedAt: null,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, amount: true, accountId: true, clubYearId: true },
    }),
  ]);

  const accType = new Map(accounts.map((a) => [a.id, a.type]));
  const yearMap = new Map(years.map((y) => [y.id, y]));

  // Partition txs by (accountId|clubYearId) preserving order
  type Slice = { running: number; opened: boolean };
  const slices = new Map<string, Slice>();

  function keyOf(accId: string, yrId: string) {
    return `${accId}|${yrId}`;
  }

  // Initialize slices with opening balances
  for (const aid of params.accountIds) {
    const t = accType.get(aid);
    if (!t) continue;
    for (const yid of params.clubYearIds) {
      const yr = yearMap.get(yid);
      if (!yr) continue;
      const opening = t === "MAIN" ? yr.openingBalanceMain : yr.openingBalanceGG;
      slices.set(keyOf(aid, yid), { running: opening, opened: true });
    }
  }

  for (const tx of txs) {
    const slice = slices.get(keyOf(tx.accountId, tx.clubYearId));
    if (!slice) continue;
    slice.running += tx.amount;
    result.set(tx.id, slice.running);
  }

  return result;
}