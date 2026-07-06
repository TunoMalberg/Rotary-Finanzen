import { prisma } from "./prisma";

/**
 * Lifecycle eines Clubjahres:
 *
 *  OPEN       → Buchungen erlaubt (laufendes Jahr)
 *  CLOSED     → Schatzmeister hat das Jahr abgeschlossen, kann jedoch noch
 *               Korrekturen einbuchen, bevor die Rechnungsprüfer prüfen.
 *  AUDITED    → Rechnungsprüfer haben geprüft, Mitgliederversammlung steht
 *               noch aus. Korrekturen nur durch Schatzmeister mit Begründung.
 *  LOCKED     → Mitgliederversammlung hat beschlossen → endgültig fixiert.
 *               Ab hier ausschließlich lesbar / archiviert.
 *
 * Reguläre Reihenfolge:
 *   30.6.   → CLOSED durch Schatzmeister
 *   ~Sept.  → AUDITED durch Rechnungsprüfer
 *   ~Dez./Jän. (Mitgliederversammlung) → LOCKED + finales Excel-Archiv
 *   1.7.    → neues Jahr OPEN.
 */
export type ClubYearStatus = "OPEN" | "CLOSED" | "AUDITED" | "LOCKED";

export type ClubYearLifecycle = {
  id: string;
  label: string;
  status: ClubYearStatus;
  isClosed: boolean;
  closedAt: Date | null;
  auditedAt: Date | null;
  lockedAt: Date | null;
  startsAt: Date;
  endsAt: Date;
};

export function statusOf(cy: {
  isClosed: boolean;
  auditedAt: Date | null;
  lockedAt: Date | null;
}): ClubYearStatus {
  if (cy.lockedAt) return "LOCKED";
  if (cy.auditedAt) return "AUDITED";
  if (cy.isClosed) return "CLOSED";
  return "OPEN";
}

export function statusLabel(status: ClubYearStatus): string {
  switch (status) {
    case "OPEN":
      return "Laufend";
    case "CLOSED":
      return "Abgeschlossen";
    case "AUDITED":
      return "Geprüft";
    case "LOCKED":
      return "Fixiert";
  }
}

/**
 * Wer darf in diesem Clubjahr Buchungen anlegen / ändern / löschen?
 *
 * Regeln:
 *  - LOCKED  → niemand (auch nicht der Schatzmeister)
 *  - AUDITED → nur Schatzmeister, mit Hinweis (späte Korrektur)
 *  - CLOSED  → nur Schatzmeister (laufende Korrekturen vor Prüfung)
 *  - OPEN    → Schatzmeister (Mitglieder ohnehin read-only)
 *
 * `requireCurrent` (default `true`) erzwingt zusätzlich, dass nur das
 * aktuell laufende Clubjahr (heute innerhalb startsAt..endsAt UND nicht
 * geschlossen) Neuanlagen zulässt – außer die Buchung wird ausdrücklich
 * mit `allowCorrection: true` als Korrektur gekennzeichnet.
 */
export type CrudCheckOpts = {
  role?: string | null;
  allowCorrection?: boolean;
};

export function checkClubYearMutable(
  cy: { isClosed: boolean; auditedAt: Date | null; lockedAt: Date | null; startsAt: Date; endsAt: Date; label: string },
  opts: CrudCheckOpts = {},
): { ok: true } | { ok: false; reason: string; status: ClubYearStatus } {
  const status = statusOf(cy);
  const isTreasurer = opts.role === "treasurer" || opts.role === "admin";
  if (status === "LOCKED") {
    return {
      ok: false,
      status,
      reason: `Clubjahr ${cy.label} ist von der Mitgliederversammlung fixiert (${cy.lockedAt?.toLocaleDateString("de-AT") ?? ""}). Buchungen können nicht mehr verändert werden.`,
    };
  }
  if (!isTreasurer) {
    return { ok: false, status, reason: "Nur der Schatzmeister kann Buchungen anlegen oder ändern." };
  }
  if ((status === "AUDITED" || status === "CLOSED") && !opts.allowCorrection) {
    return {
      ok: false,
      status,
      reason: `Clubjahr ${cy.label} ist ${statusLabel(status).toLowerCase()}. Bitte ausdrücklich als Korrektur kennzeichnen.`,
    };
  }
  return { ok: true };
}

/**
 * Ermittelt das Clubjahr, in dem das übergebene Datum liegt – Standardregel
 * 1.7.–30.6. Optional fällt zurück auf das aktuelle laufende Jahr.
 */
export async function getClubYearForDate(date: Date) {
  return prisma.clubYear.findFirst({
    where: { startsAt: { lte: date }, endsAt: { gte: date } },
  });
}

/**
 * Berechnet Label + Grenzen des rotarischen Clubjahres (1.7.–30.6.),
 * in dem das Datum liegt. Rein rechnerisch, ohne DB.
 *   Monat Juli (Index 6) bis Dezember → Jahr Y beginnt das Clubjahr Y/Y+1.
 *   Monat Jänner bis Juni → das Datum gehört zum Clubjahr (Y-1)/Y.
 */
export function clubYearBoundsForDate(date: Date): {
  label: string;
  startsAt: Date;
  endsAt: Date;
} {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-basiert; 6 = Juli
  const startYear = m >= 6 ? y : y - 1;
  return {
    label: `${startYear}/${startYear + 1}`,
    startsAt: new Date(Date.UTC(startYear, 6, 1)), // 1.7.
    endsAt: new Date(Date.UTC(startYear + 1, 5, 30, 23, 59, 59)), // 30.6.
  };
}

/**
 * Liefert das Clubjahr für ein Datum und legt es – falls es noch nicht
 * existiert – automatisch an. Die Eröffnungssalden des neuen Jahres werden
 * aus dem Schlusssaldo des unmittelbaren Vorjahres übernommen (Übernahme).
 *
 * Damit landen z. B. Juli-Buchungen nach dem 30.6. automatisch im neuen
 * rotarischen Jahr, statt fälschlich im alten.
 */
export async function ensureClubYearForDate(date: Date) {
  const existing = await getClubYearForDate(date);
  if (existing) return existing;

  const { label, startsAt, endsAt } = clubYearBoundsForDate(date);
  const already = await prisma.clubYear.findUnique({ where: { label } });
  if (already) return already;

  // Eröffnungssalden = Schlusssalden des Vorjahres (Übernahme).
  const prev = await prisma.clubYear.findFirst({
    where: { endsAt: { lt: startsAt } },
    orderBy: { endsAt: "desc" },
  });
  let openingBalanceMain = 0;
  let openingBalanceGG = 0;
  if (prev) {
    const accounts = await prisma.account.findMany({
      select: { id: true, type: true },
    });
    const main = accounts.find((a) => a.type === "MAIN");
    const gg = accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST");
    if (main) {
      const s = await prisma.transaction.aggregate({
        where: { accountId: main.id, clubYearId: prev.id, deletedAt: null },
        _sum: { amount: true },
      });
      openingBalanceMain = prev.openingBalanceMain + (s._sum.amount ?? 0);
    }
    if (gg) {
      const s = await prisma.transaction.aggregate({
        where: { accountId: gg.id, clubYearId: prev.id, deletedAt: null },
        _sum: { amount: true },
      });
      openingBalanceGG = prev.openingBalanceGG + (s._sum.amount ?? 0);
    }
  }

  return prisma.clubYear.create({
    data: { label, startsAt, endsAt, openingBalanceMain, openingBalanceGG },
  });
}

export async function ensureCurrentClubYear() {
  const today = new Date();
  const cy = await getClubYearForDate(today);
  if (cy) return cy;
  // Fallback: jüngstes nicht-fixiertes Jahr
  return prisma.clubYear.findFirst({ where: { lockedAt: null }, orderBy: { startsAt: "desc" } });
}