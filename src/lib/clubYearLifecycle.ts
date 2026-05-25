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

export async function ensureCurrentClubYear() {
  const today = new Date();
  const cy = await getClubYearForDate(today);
  if (cy) return cy;
  // Fallback: jüngstes nicht-fixiertes Jahr
  return prisma.clubYear.findFirst({ where: { lockedAt: null }, orderBy: { startsAt: "desc" } });
}