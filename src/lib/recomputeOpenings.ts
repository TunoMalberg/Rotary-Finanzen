import { prisma } from "./prisma";

/**
 * Eröffnungssalden-Übernahme-Kette neu berechnen.
 *
 * Buchhalterische Grundregel: der Endsaldo eines Clubjahres ist der
 * Eröffnungssaldo des Folgejahres. Wird eine Buchung nachträglich verschoben
 * (z. B. Juli-Buchung ins richtige Jahr) oder storniert, stimmt der bereits
 * gespeicherte Eröffnungssaldo des Folgejahres nicht mehr. Diese Funktion
 * setzt die Kette wieder konsistent:
 *
 *   opening(Jahr N+1) = opening(Jahr N) + Σ Bewegungen(Jahr N)
 *
 * Regeln / Sicherheit:
 *  - Das früheste Jahr behält seinen (manuell gepflegten) Eröffnungssaldo.
 *  - FIXIERTE (lockedAt) Jahre werden NICHT verändert – ihr gespeicherter
 *    Eröffnungssaldo bleibt als Basis erhalten (Archiv-Integrität). Die Kette
 *    läuft von dort weiter.
 *  - `dryRun` ändert nichts, liefert nur die geplanten Änderungen.
 */
export type OpeningChange = {
  yearId: string;
  yearLabel: string;
  locked: boolean;
  account: "MAIN" | "GG";
  storedOpening: number;
  computedOpening: number;
  delta: number; // computed - stored
};

export async function recomputeOpeningBalances(opts: { dryRun?: boolean } = {}) {
  const dryRun = opts.dryRun !== false; // default: dry-run (sicher)

  const [years, accounts, groups] = await Promise.all([
    prisma.clubYear.findMany({ orderBy: { startsAt: "asc" } }),
    prisma.account.findMany(),
    prisma.transaction.groupBy({
      by: ["accountId", "clubYearId"],
      where: { deletedAt: null },
      _sum: { amount: true },
    }),
  ]);
  const main = accounts.find((a) => a.type === "MAIN") ?? null;
  const gg = accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST") ?? null;

  const sumFor = (accountId: string | undefined, yearId: string) => {
    if (!accountId) return 0;
    const g = groups.find((x) => x.accountId === accountId && x.clubYearId === yearId);
    return g?._sum.amount ?? 0;
  };

  const changes: OpeningChange[] = [];
  const updates: Array<{ id: string; openingBalanceMain?: number; openingBalanceGG?: number }> = [];

  // Laufender Endsaldo des jeweils vorherigen Jahres.
  let prevClosingMain: number | null = null;
  let prevClosingGG: number | null = null;

  for (const y of years) {
    const locked = !!y.lockedAt;

    // Eröffnungssaldo, den wir für dieses Jahr ANSETZEN:
    //  - erstes Jahr ODER fixiertes Jahr → gespeicherter Wert (unverändert)
    //  - sonst → Endsaldo des Vorjahres (Übernahme)
    const useMain =
      prevClosingMain == null || locked ? y.openingBalanceMain : prevClosingMain;
    const useGG =
      prevClosingGG == null || locked ? y.openingBalanceGG : prevClosingGG;

    // Änderungen nur für nicht-fixierte Jahre mit Vorgänger vormerken.
    if (!locked && prevClosingMain != null) {
      const deltaMain = useMain - y.openingBalanceMain;
      const deltaGG = useGG - y.openingBalanceGG;
      const upd: { id: string; openingBalanceMain?: number; openingBalanceGG?: number } = { id: y.id };
      if (Math.abs(deltaMain) >= 0.005) {
        changes.push({
          yearId: y.id,
          yearLabel: y.label,
          locked,
          account: "MAIN",
          storedOpening: y.openingBalanceMain,
          computedOpening: round2(useMain),
          delta: round2(deltaMain),
        });
        upd.openingBalanceMain = round2(useMain);
      }
      if (Math.abs(deltaGG) >= 0.005) {
        changes.push({
          yearId: y.id,
          yearLabel: y.label,
          locked,
          account: "GG",
          storedOpening: y.openingBalanceGG,
          computedOpening: round2(useGG),
          delta: round2(deltaGG),
        });
        upd.openingBalanceGG = round2(useGG);
      }
      if (upd.openingBalanceMain != null || upd.openingBalanceGG != null) {
        updates.push(upd);
      }
    }

    // Endsaldo dieses Jahres = angesetzter Eröffnungssaldo + Bewegungen.
    prevClosingMain = round2(useMain + sumFor(main?.id, y.id));
    prevClosingGG = round2(useGG + sumFor(gg?.id, y.id));
  }

  if (!dryRun && updates.length > 0) {
    for (const u of updates) {
      await prisma.clubYear.update({
        where: { id: u.id },
        data: {
          ...(u.openingBalanceMain != null ? { openingBalanceMain: u.openingBalanceMain } : {}),
          ...(u.openingBalanceGG != null ? { openingBalanceGG: u.openingBalanceGG } : {}),
        },
      });
    }
  }

  return { dryRun, changed: updates.length, changes };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}