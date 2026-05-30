/**
 * Auto-Match-Heuristik: Eingehende Lieferanten-Rechnung (MailInbox) auf eine
 * bestehende Bank-Buchung (Transaction) abbilden.
 *
 * Score-Bestandteile (max. 1.0):
 *   - Betragsmatch (±0,01 EUR): +0.5
 *   - Datum innerhalb ±45 Tage: +0.15 (linear abnehmend mit Distanz)
 *   - IBAN aus Rechnung kommt im Verwendungszweck/Counterparty vor: +0.25
 *   - Rechnungs-Nr. taucht in code/purpose/note auf: +0.20
 *   - Lieferantenname (Mail-From-Domain oder fromName) im counterparty: +0.10
 *
 * Auto-Link erst ab Score ≥ 0.85 UND eindeutigem Top-Treffer
 * (zweitplatzierte Buchung mind. 0.15 darunter).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type MatchCandidate = {
  transactionId: string;
  score: number;
  reasons: string[];
  amount: number;
  date: Date;
  counterparty: string | null;
  purpose: string | null;
};

export type MatchInput = {
  amount: number | null;
  iban: string | null;
  invoiceNumber: string | null;
  fromAddress: string;
  fromName: string | null;
  receivedAt: Date;
  /** Komplettes Suchtext-Bag (Mail-Body + extrahierte PDF-Texte). */
  searchText?: string;
};

const DATE_WINDOW_DAYS = 45;

/** Findet die besten Buchungs-Kandidaten für eine eingegangene Rechnung. */
export async function findMatchCandidates(
  input: MatchInput,
  limit = 5,
): Promise<MatchCandidate[]> {
  // Vorfilter: nur Buchungen in offenen/aktuellen Clubjahren, gleicher
  // Vorzeichen-Sinn (Rechnung = Ausgabe = negativer Betrag in der Buchung).
  const where: Prisma.TransactionWhereInput = {
    deletedAt: null,
    clubYear: { lockedAt: null },
  };
  // Wenn Betrag bekannt: harte Vorfilterung auf -amount ± 1 EUR.
  if (input.amount != null) {
    where.amount = { lte: -input.amount + 1, gte: -input.amount - 1 };
  }
  // Datums-Vorfilter
  const minDate = new Date(input.receivedAt);
  minDate.setDate(minDate.getDate() - DATE_WINDOW_DAYS);
  const maxDate = new Date(input.receivedAt);
  maxDate.setDate(maxDate.getDate() + 14); // Bank-Buchung kann 1–2 Wochen nach Rechnung kommen
  where.date = { gte: minDate, lte: maxDate };

  const candidates = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      amount: true,
      date: true,
      counterparty: true,
      purpose: true,
      code: true,
      note: true,
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  // Domain aus Mail-Adresse für Counterparty-Match.
  const fromDomain = input.fromAddress.includes("@")
    ? input.fromAddress.split("@")[1].toLowerCase()
    : null;
  const fromName = (input.fromName ?? "").toLowerCase();

  const scored: MatchCandidate[] = candidates.map((tx) => {
    const reasons: string[] = [];
    let score = 0;

    // Betrags-Match
    if (input.amount != null && Math.abs(Math.abs(tx.amount) - input.amount) <= 0.01) {
      score += 0.5;
      reasons.push("Betrag exakt");
    } else if (input.amount != null && Math.abs(Math.abs(tx.amount) - input.amount) <= 0.5) {
      score += 0.3;
      reasons.push("Betrag ±0,50");
    }

    // Datum
    const days = Math.abs(
      (tx.date.getTime() - input.receivedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (days <= DATE_WINDOW_DAYS) {
      const dateScore = 0.15 * (1 - days / DATE_WINDOW_DAYS);
      score += dateScore;
      if (days <= 7) reasons.push("Datum binnen 7 Tagen");
      else if (days <= 21) reasons.push("Datum binnen 3 Wochen");
    }

    const haystack = [tx.counterparty, tx.purpose, tx.code, tx.note]
      .filter((s): s is string => Boolean(s))
      .join(" ")
      .toLowerCase();

    // IBAN
    if (input.iban && haystack.includes(input.iban.toLowerCase())) {
      score += 0.25;
      reasons.push("IBAN passt");
    }

    // Rechnungs-Nr.
    if (input.invoiceNumber && haystack.includes(input.invoiceNumber.toLowerCase())) {
      score += 0.2;
      reasons.push(`Rechnungs-Nr. ${input.invoiceNumber}`);
    }

    // Lieferantenname / Domain
    if (fromDomain) {
      const stem = fromDomain.replace(/\.(com|at|de|eu|org|net|io|app)$/i, "");
      if (stem.length > 3 && haystack.includes(stem)) {
        score += 0.1;
        reasons.push(`Domain ${stem}`);
      }
    }
    if (fromName && fromName.length > 3) {
      const firstWord = fromName.split(/\s+/)[0];
      if (firstWord.length > 3 && haystack.includes(firstWord)) {
        score += 0.05;
        reasons.push(`Name ${firstWord}`);
      }
    }

    return {
      transactionId: tx.id,
      score: Math.min(score, 1),
      reasons,
      amount: tx.amount,
      date: tx.date,
      counterparty: tx.counterparty,
      purpose: tx.purpose,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Auto-Link nur bei eindeutigem, hochkonfidentem Treffer. */
export function shouldAutoLink(candidates: MatchCandidate[]): MatchCandidate | null {
  if (candidates.length === 0) return null;
  const top = candidates[0];
  if (top.score < 0.85) return null;
  const second = candidates[1];
  if (second && top.score - second.score < 0.15) return null;
  return top;
}