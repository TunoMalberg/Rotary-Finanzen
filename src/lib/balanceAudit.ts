/**
 * Konto-Saldo-Audit
 *
 * Berechnet pro (Clubjahr × Konto):
 *  - Eröffnungssaldo (gespeichert)
 *  - Summe aller Buchungen
 *  - berechneter Endsaldo (= opening + sum)
 *  - erwarteter Eröffnungssaldo des Folgejahres (= Endsaldo)
 *  - tatsächlich gespeicherter Eröffnungssaldo des Folgejahres
 *  - Differenz / OK-Flag
 *
 * Außerdem werden Verdachts-Duplikate erkannt: identische
 * Buchungen (Datum + Betrag) im selben Konto, bei denen mindestens
 * eine ohne `externalRef` ist. Solche Konstellationen entstehen meist
 * durch erneuten Bank-Import nach manueller Erfassung.
 */
import { prisma } from "./prisma";

export type AccountAuditRow = {
  yearId: string;
  yearLabel: string;
  startsAt: Date;
  isClosed: boolean;
  accountType: "MAIN" | "GLOBAL_GRANT_TRUST";
  accountName: string;
  openingBalance: number;
  movementsSum: number;
  txCount: number;
  computedClosing: number;
  /** Erwarteter Eröffnungssaldo des Folgejahres = computedClosing */
  expectedNextOpening: number | null;
  /** Tatsächlich gespeicherter Eröffnungssaldo des Folgejahres */
  storedNextOpening: number | null;
  /** Differenz next.stored − this.computed; null wenn kein Folgejahr */
  carryOverDelta: number | null;
  ok: boolean;
};

export type DuplicateGroup = {
  date: Date;
  amount: number;
  accountId: string;
  accountType: string;
  rows: Array<{
    id: string;
    counterparty: string | null;
    purpose: string | null;
    source: string;
    externalRef: string | null;
    importBatchId: string | null;
  }>;
};

export async function auditAccountBalances(): Promise<{
  rows: AccountAuditRow[];
  duplicates: DuplicateGroup[];
  duplicateCount: number;
  duplicateSum: number;
}> {
  const years = await prisma.clubYear.findMany({ orderBy: { startsAt: "asc" } });
  const accounts = await prisma.account.findMany({ orderBy: { type: "asc" } });

  const rows: AccountAuditRow[] = [];
  for (const acc of accounts) {
    for (let i = 0; i < years.length; i++) {
      const yr = years[i];
      const next = years[i + 1] ?? null;
      const isMain = acc.type === "MAIN";
      const opening = isMain ? yr.openingBalanceMain : yr.openingBalanceGG;
      const sum = await prisma.transaction.aggregate({
        where: { accountId: acc.id, clubYearId: yr.id, deletedAt: null },
        _sum: { amount: true },
        _count: true,
      });
      const movementsSum = sum._sum.amount ?? 0;
      const computedClosing = opening + movementsSum;
      const storedNextOpening = next
        ? isMain
          ? next.openingBalanceMain
          : next.openingBalanceGG
        : null;
      const expectedNextOpening = next ? computedClosing : null;
      const carryOverDelta =
        storedNextOpening != null && expectedNextOpening != null
          ? storedNextOpening - expectedNextOpening
          : null;
      // Toleranz 1 Cent
      const ok = carryOverDelta == null || Math.abs(carryOverDelta) < 0.01;
      rows.push({
        yearId: yr.id,
        yearLabel: yr.label,
        startsAt: yr.startsAt,
        isClosed: yr.isClosed,
        accountType: acc.type as "MAIN" | "GLOBAL_GRANT_TRUST",
        accountName: acc.name,
        openingBalance: opening,
        movementsSum,
        txCount: sum._count,
        computedClosing,
        expectedNextOpening,
        storedNextOpening,
        carryOverDelta,
        ok,
      });
    }
  }

  // Duplikate suchen: pro Konto & Datum & Betrag mehr als 1 Buchung,
  // mindestens eine ohne externalRef → wahrscheinlich doppelter Import.
  const all = await prisma.transaction.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      accountId: true,
      account: { select: { type: true } },
      date: true,
      amount: true,
      counterparty: true,
      purpose: true,
      source: true,
      externalRef: true,
      importBatchId: true,
    },
  });
  const groups = new Map<string, typeof all>();
  for (const t of all) {
    const key = `${t.accountId}|${t.date.toISOString().slice(0, 10)}|${t.amount.toFixed(2)}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const duplicates: DuplicateGroup[] = [];
  let duplicateCount = 0;
  let duplicateSum = 0;
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    const hasNoRef = arr.some((t) => !t.externalRef);
    const hasRef = arr.some((t) => t.externalRef);
    if (!hasNoRef || !hasRef) continue;
    const first = arr[0];
    duplicates.push({
      date: first.date,
      amount: first.amount,
      accountId: first.accountId,
      accountType: first.account.type,
      rows: arr.map((t) => ({
        id: t.id,
        counterparty: t.counterparty,
        purpose: t.purpose,
        source: t.source,
        externalRef: t.externalRef,
        importBatchId: t.importBatchId,
      })),
    });
    duplicateCount += arr.length - 1;
    duplicateSum += first.amount * (arr.length - 1);
  }
  duplicates.sort((a, b) => b.date.getTime() - a.date.getTime());

  return { rows, duplicates, duplicateCount, duplicateSum };
}