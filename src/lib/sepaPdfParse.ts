/**
 * Parser für SEPA-Sammeleinzug-PDFs aus George (Erste Bank).
 *
 * Beispiel-Aufbau:
 *
 *   Kontoinhaber:in: Rotary Club Wien-Donau
 *   IBAN: AT41 2011 1310 0670 0296
 *   Name der Sammlung   QJMT6SX1 Mitgliedsbeitrag 24-25
 *   Anzahl der Aufträge   67 Aufträge
 *   Lastschriftsumme   38.860,00 EUR
 *   Durchführung   20.01.2026
 *   ...
 *   Partner:in   Info   Betrag
 *   Auersperg Ferdinand  Rotary Mitgliedsbeitrag 7/25-6/26  580,00 EUR
 *   ROTARY  AT98 1200 0105 0492 4100
 *   Abgeschlossen   SEPA-Lastschrift   Ihre Lizenz   Manueller Auftrag
 *
 * Liefert Header-Daten + Liste der einzelnen SEPA-Einzüge.
 */
import { parseGermanNumber } from "./format";

export type SepaEntry = {
  /** Voller Partner-Name aus dem PDF, z. B. "Auersperg Ferdinand" oder
   *  "Engel Prof. Dr. Alfred". */
  partnerName: string;
  /** Heuristisch extrahierter Nachname für Member-Match (erstes Token). */
  lastName: string;
  /** Mandats-Referenz (typischerweise GROSSGESCHRIEBENER Nachname),
   *  z. B. "AUERSPERG", "BECK" oder "ROTARY" für inhaberidentische
   *  Konten. */
  mandateRef: string | null;
  partnerIban: string | null;
  /** "Info"-Spalte, z. B. "Rotary Mitgliedsbeitrag 7/25-6/26". */
  info: string | null;
  amount: number;
};

export type SepaParseResult = {
  /** "Name der Sammlung", z. B. "QJMT6SX1 Mitgliedsbeitrag 24-25". */
  collectionName: string | null;
  /** Erstes Token der Sammlung-Bezeichnung – bei Erste Bank typischerweise
   *  ein 8-stelliger Sammlungs-Code (z. B. "QJMT6SX1"), der auch im
   *  Verwendungszweck der aggregierten Bank-Buchung auftaucht. */
  collectionRef: string | null;
  /** Anzahl der laut PDF enthaltenen Aufträge. */
  expectedCount: number | null;
  /** Lastschriftsumme aus dem PDF-Header. */
  totalAmount: number | null;
  executionDate: Date | null;
  dueDate: Date | null;
  creditorId: string | null;
  /** IBAN des Auftraggeberkontos (= Club-Konto). */
  iban: string | null;
  status: string | null;
  /** Geparste Einzelaufträge (sollte expectedCount entsprechen). */
  entries: SepaEntry[];
};

/* -------------------- Hilfsfunktionen -------------------- */

const IBAN_RE = /^[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}$/;

function normalizeIban(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

function parseGermanDate(s: string): Date | null {
  const m = s.match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/** Laden der Lines aus pdfjs-dist (legacy build, läuft serverseitig).
 *  pdfjs-dist ist als `serverExternalPackages` in next.config.js eingetragen,
 *  damit der Worker zur Laufzeit aus node_modules geladen wird. */
async function pdfToLines(buf: ArrayBuffer): Promise<string[]> {
  const pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    type Item = { str: string; x: number; y: number };
    const items: Item[] = (tc.items as unknown as Array<{
      str: string;
      transform: number[];
    }>).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let curY: number | null = null;
    let cur: string[] = [];
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > 2) {
        if (cur.length) lines.push(cur.join(" ").trim());
        cur = [it.str];
        curY = it.y;
      } else {
        cur.push(it.str);
      }
    }
    if (cur.length) lines.push(cur.join(" ").trim());
  }
  return lines;
}

/* -------------------- Hauptfunktion -------------------- */

/**
 * Erkennt Zeilen wie:
 *   "Auersperg Ferdinand Rotary Mitgliedsbeitrag 7/25-6/26 580,00 EUR"
 *   "Engel Prof. Dr. Alfred Rotary Mitgliedsbeitrag 7/25-6/26 580,00 EUR"
 *
 * Capture-Gruppen: 1=name, 2=info, 3=amount
 */
const ENTRY_RE =
  /^(.+?)\s+((?:Rotary\s+)?Mitgliedsbeitrag[^\d]*\d{1,2}\/\d{2}-\d{1,2}\/\d{2})\s+(-?\d{1,3}(?:[.\u00a0]\d{3})*,\d{2})\s*EUR\s*$/;
/** Generischer Fallback für andere Sammlungs-Typen (kein "Mitgliedsbeitrag"). */
const ENTRY_RE_FALLBACK =
  /^([\p{L}.\- ]+?)\s+(.+?)\s+(-?\d{1,3}(?:[.\u00a0]\d{3})*,\d{2})\s*EUR\s*$/u;

/**
 * Parst einen Erste-Bank/George-SEPA-Sammeleinzug-PDF.
 */
export async function parseSepaPdf(file: File): Promise<SepaParseResult> {
  const buf = await file.arrayBuffer();
  const lines = await pdfToLines(buf);

  const result: SepaParseResult = {
    collectionName: null,
    collectionRef: null,
    expectedCount: null,
    totalAmount: null,
    executionDate: null,
    dueDate: null,
    creditorId: null,
    iban: null,
    status: null,
    entries: [],
  };

  // ---- Header parsen ----
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, " ").trim();
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^Name der Sammlung\s+(.+)$/i))) {
      result.collectionName = m[1].trim();
      result.collectionRef = m[1].trim().split(/\s+/)[0] || null;
    } else if ((m = l.match(/^Anzahl der Aufträge\s+(\d+)/i))) {
      result.expectedCount = Number(m[1]);
    } else if (
      (m = l.match(/^Lastschriftsumme\s+([\d.,\u00a0]+)\s*EUR/i)) ||
      (m = l.match(/^Summe der Lastschriften\s+([\d.,\u00a0]+)\s*EUR/i))
    ) {
      result.totalAmount = parseGermanNumber(m[1]);
    } else if ((m = l.match(/^Durchführung\s+(\d{1,2}\.\d{1,2}\.\d{4})/i))) {
      result.executionDate = parseGermanDate(m[1]);
    } else if ((m = l.match(/Fälligkeitsdatum\s+(\d{1,2}\.\d{1,2}\.\d{4})/i))) {
      result.dueDate = parseGermanDate(m[1]);
    } else if ((m = l.match(/^Creditor ID\s+([A-Z0-9]+)/i))) {
      result.creditorId = m[1];
    } else if ((m = l.match(/^IBAN:\s+([A-Z0-9 ]+)$/i))) {
      result.iban = normalizeIban(m[1]);
    } else if ((m = l.match(/^Status\s+(.+)$/i))) {
      result.status = m[1].trim();
    }
  }

  // ---- Einzelaufträge parsen ----
  // Muster pro Eintrag (3 Zeilen):
  //   <Partner-Name>  <Info>  <Betrag> EUR
  //   <MANDATE-REF>  <IBAN>     (oder umgekehrt; IBAN kann fehlen)
  //   Abgeschlossen ...
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\s+/g, " ").trim();
    // Header-Zeile "Partner:in Info Betrag" und "Lastschriftsumme" filtern
    if (/^Partner:?in/i.test(l) || /^Lastschriftsumme/i.test(l)) continue;
    const m = l.match(ENTRY_RE) ?? l.match(ENTRY_RE_FALLBACK);
    if (!m) continue;
    const amount = parseGermanNumber(m[3] ?? "");
    if (!Number.isFinite(amount) || amount === 0) continue;
    const partnerName = (m[1] ?? "").trim();
    const info = (m[2] ?? "").trim() || null;

    // Folgezeile (IBAN + Mandate-Ref)
    let partnerIban: string | null = null;
    let mandateRef: string | null = null;
    const next = (lines[i + 1] || "").replace(/\s+/g, " ").trim();
    if (next) {
      // Tokens: alle Wörter
      const tokens = next.split(/\s+/);
      // Suche IBAN (zusammenhängende Buchstaben+Ziffern, ggf. mit Leerzeichen)
      // Versuche zuerst die ganze Zeile als IBAN (ohne Spaces)
      const noSpace = next.replace(/\s+/g, "");
      const ibanMatch = noSpace.match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/);
      if (ibanMatch) {
        partnerIban = ibanMatch[0];
        // Mandate ref = Tokens, die nicht Teil der IBAN sind
        const ref = tokens
          .filter((t) => !ibanMatch[0].includes(t.replace(/\s+/g, "")))
          .filter((t) => /^[A-ZÄÖÜß-]+$/.test(t))
          .join(" ");
        mandateRef = ref || null;
      } else {
        // Nur Mandate-Ref?
        if (/^[A-ZÄÖÜß \-]+$/.test(next)) mandateRef = next;
      }
    }

    // Heuristik für Nachname: erstes Token, das KEIN Titel ist.
    // PDF-Konvention bei Erste Bank: Lastname kommt vor Firstname und Titeln,
    // aber Titel davor sind selten. Fallback: erstes Token.
    const tokens = partnerName.split(/\s+/);
    const TITLES = new Set([
      "Dr.", "Dr", "Mag.", "Mag", "Prof.", "Prof", "DI", "DI.",
      "Dipl.", "Dipl", "Ing.", "Ing", "MBA", "MA", "MSc", "Mr.", "Mrs.", "Ms.",
    ]);
    let lastName = tokens.find((t) => !TITLES.has(t)) || partnerName;
    // Wenn Mandate-Ref existiert und ein Token aus dem Namen "groß-equal" der
    // Mandate-Ref ist, nimm dieses (z. B. "Engel" für "ENGEL").
    if (mandateRef) {
      const refLower = mandateRef.toLowerCase();
      const matchTok = tokens.find((t) => t.toLowerCase() === refLower);
      if (matchTok) lastName = matchTok;
    }

    result.entries.push({
      partnerName,
      lastName,
      mandateRef,
      partnerIban,
      info,
      amount,
    });
  }

  return result;
}