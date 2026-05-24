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
 * Wir holen ALLE Buchungen pro (Konto × Jahr) – nicht nur die gefilterten –
 * damit der Saldo auch bei aktiven UI-Filtern (Suche/Kategorie) korrekt bleibt.
 */
export async function computeRunningBalances(params: {
  accountIds: string[];
  clubYearIds: string[];
}): Promise<RunningBalanceMap> {
  const result: RunningBalanceMap = new Map();
  if (params.accountIds.length === 0 || params.clubYearIds.length === 0) return result;

  const [accounts, years] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: params.accountIds } } }),
    prisma.clubYear.findMany({
      where: { id: { in: params.clubYearIds } },
      select: { id: true, openingBalanceMain: true, openingBalanceGG: true },
    }),
  ]);

  for (const acc of accounts) {
    for (const yr of years) {
      const opening =
        acc.type === "MAIN" ? yr.openingBalanceMain : yr.openingBalanceGG;
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: acc.id,
          clubYearId: yr.id,
          deletedAt: null,
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, amount: true },
      });
      let running = opening;
      for (const t of txs) {
        running += t.amount;
        result.set(t.id, running);
      }
    }
  }

  return result;
}