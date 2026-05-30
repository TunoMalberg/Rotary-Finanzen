/**
 * Heuristik-Extraktor für Rechnungs-Schlüsselfelder aus Mail- und PDF-Texten.
 *
 * Ziel: aus einer eingegangenen Lieferanten-Rechnung (PDF im Mail-Anhang
 * oder Mail-Body) Brutto-Betrag, IBAN und Rechnungs-Nr. herausziehen, damit
 * die `matchTransaction()`-Funktion automatisch die passende Bank-Buchung
 * findet.
 *
 * Wir versuchen mehrere Anker-Phrasen ("Rechnungsbetrag", "Gesamt",
 * "Total", "Zu zahlen") und nehmen den größten plausiblen Betrag, falls
 * keine Phrase greift.
 */

export type ExtractedInvoice = {
  amount: number | null;
  iban: string | null;
  invoiceNumber: string | null;
};

const IBAN_RE = /\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30})\b/g;
const AMOUNT_RE = /(\d{1,3}(?:[.\u00a0]\d{3})*,\d{2})\s*(?:€|EUR)/g;

const TOTAL_HINTS = [
  /(?:gesamt(?:summe|betrag)?|rechnungs?(?:gesamt)?betrag|zu zahlen|endbetrag|total\s+(?:gross|brutto)?|gross\s+total|summe\s+brutto|brutto\s*summe|total)/i,
];

const INV_NO_HINTS = [
  /rechnungs?[\-\s]?(?:nr|nummer)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/_]{2,30})/i,
  /\binvoice\s+(?:no|number|#)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/_]{2,30})/i,
  /\bRG[\-\s]?\.?\s*([A-Z0-9][A-Z0-9\-\/_]{2,30})/i,
];

function parseGermanNumber(s: string): number {
  const cleaned = s.replace(/[.\u00a0]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Extrahiert IBAN, Betrag und Rechnungs-Nr. aus Klartext. */
export function extractInvoiceFromText(text: string): ExtractedInvoice {
  if (!text) return { amount: null, iban: null, invoiceNumber: null };
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");

  // IBAN: erste plausible Treffer
  let iban: string | null = null;
  const ibanMatches = [...normalized.matchAll(IBAN_RE)];
  for (const m of ibanMatches) {
    const candidate = m[1].replace(/\s+/g, "").toUpperCase();
    if (candidate.length >= 15 && candidate.length <= 34) {
      iban = candidate;
      break;
    }
  }

  // Betrag: bevorzugt in der Nähe von "Gesamt"/"Brutto"/"Total" (±80 Zeichen)
  let amount: number | null = null;
  for (const hint of TOTAL_HINTS) {
    const hintMatch = normalized.match(hint);
    if (hintMatch && hintMatch.index != null) {
      const window = normalized.slice(
        Math.max(0, hintMatch.index - 20),
        Math.min(normalized.length, hintMatch.index + 200),
      );
      const amts = [...window.matchAll(AMOUNT_RE)];
      if (amts.length > 0) {
        // Bei mehreren: den größten nehmen (Brutto > Netto > MwSt).
        const values = amts
          .map((a) => parseGermanNumber(a[1]))
          .filter((n) => Number.isFinite(n));
        if (values.length > 0) {
          amount = Math.max(...values);
          break;
        }
      }
    }
  }
  // Fallback: größten Betrag im ganzen Text nehmen
  if (amount == null) {
    const allAmounts = [...normalized.matchAll(AMOUNT_RE)]
      .map((a) => parseGermanNumber(a[1]))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 1_000_000);
    if (allAmounts.length > 0) amount = Math.max(...allAmounts);
  }

  // Rechnungs-Nr.
  let invoiceNumber: string | null = null;
  for (const re of INV_NO_HINTS) {
    const m = normalized.match(re);
    if (m && m[1]) {
      invoiceNumber = m[1].replace(/[.,;:]+$/, "");
      break;
    }
  }

  return { amount, iban, invoiceNumber };
}

/** Liest aus einem PDF-Buffer Klartext via pdfjs-serverless und extrahiert. */
export async function extractInvoiceFromPdf(buf: Buffer): Promise<ExtractedInvoice> {
  try {
    const { getDocument } = await import("pdfjs-serverless");
    const data = new Uint8Array(buf);
    const doc = await getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      type Item = { str: string };
      text += (tc.items as unknown as Item[]).map((it) => it.str).join(" ") + "\n";
      if (i >= 5) break; // typische Rechnung 1–3 Seiten, mehr nicht nötig
    }
    return extractInvoiceFromText(text);
  } catch (e) {
    console.warn("[invoiceExtract] PDF parse failed", e);
    return { amount: null, iban: null, invoiceNumber: null };
  }
}