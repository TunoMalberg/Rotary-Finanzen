/**
 * Bau- und Hilfslogik für den SEPA-Sammellastschrift-Export (George Business,
 * Erste/Sparkasse). Reine Funktionen ohne DB-/Request-Abhängigkeit, damit sie
 * leicht testbar sind und in der API-Route nur noch Daten eingesammelt werden.
 *
 * George-Lastschrift-Vorlage: 26 Spalten, Semikolon-getrennt, feste Reihenfolge
 * (A–Z, siehe SEPA_HEADER). Ein Datensatz = eine einzuziehende DUES-Rechnung.
 */

/** Exakte Headerzeile (Reihenfolge A–Z) der George-Lastschrift-Vorlage. */
export const SEPA_HEADER = [
  "Auftragsart", // A
  "Auftraggeber-IBAN", // B
  "Creditor-ID", // C
  "Mandatstyp", // D
  "Faelligkeitsdatum", // E
  "Bestandsbildung", // F
  "Bestandsname", // G
  "Einzelbuchung gewuenscht", // H
  "Betrag", // I
  "Zahlungspflichtiger-IBAN", // J
  "Zahlungspflichtiger-Name", // K
  "Mandatsreferenz", // L
  "Mandatsausstellungsdatum", // M
  "Verwendungszweck", // N
  "Zahlungsreferenz", // O
  "Auftraggeberreferenz", // P
  "Zahlungspflichtiger-Strasse", // Q
  "Zahlungspflichtiger-Hausnummer", // R
  "Zahlungspflichtiger-Tuernummer", // S
  "Zahlungspflichtiger-Postleitzahl", // T
  "Zahlungspflichtiger-Stadt", // U
  "Zahlungspflichtiger-Land", // V
  "Category Purpose Code", // W
  "Purpose Code", // X
  "Abweichender Auftraggeber Name", // Y
  "Abweichender Zahlungspflichtiger Name", // Z
] as const;

/** Die exakte Headerzeile als Semikolon-String (ohne Zeilenende). */
export const SEPA_HEADER_LINE = SEPA_HEADER.join(";");

/** Eingangsdaten je einzuziehender Rechnung (aus DB zusammengestellt). */
export type SepaExportRow = {
  /** Betrag in EUR (positiv). */
  amount: number;
  /** IBAN des Zahlungspflichtigen (Mitglied). */
  memberIban: string;
  /** Vorname des Mitglieds. */
  firstName: string;
  /** Nachname des Mitglieds. */
  lastName: string;
  /** Rotary-Mitgliedsnummer (für Mandatsreferenz), falls vorhanden. */
  rotaryMemberId: number | null;
  /** Stabile interne Member-ID (Fallback für Mandatsreferenz). */
  memberId: string;
  /** Verwendungszweck (z. B. Rechnungsbeschreibung), optional. */
  description: string | null;
};

/** Clubweite SEPA-Einstellungen. */
export type SepaSettings = {
  creditorId: string;
  auftraggeberIban: string;
  /** Mandatsausstellungsdatum im Format TT.MM.JJJJ. */
  mandateDate: string;
  /** Optionale Verwendungszweck-Vorlage. */
  verwendungszweck?: string;
};

/** Optionen für den Export. */
export type BuildSepaOptions = {
  /** Fälligkeitsdatum im Format TT.MM.JJJJ (oder leer). */
  faelligkeitsdatum?: string;
  /** Bestandsname (max 35 Zeichen, wird sanitisiert). */
  bestandsname?: string;
};

// Zeichensätze für die Sanitisierung.
// „breit" – für Name / Verwendungszweck / Bestandsname.
const WIDE_ALLOWED =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäÄöÖüÜß0123456789 -+_:.,()/'?&€$§%!;=#~*{}[]<>|@^°";
// „schmal" – für Mandatsreferenz / Zahlungsreferenz (KEIN Bindestrich!).
const NARROW_ALLOWED =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+?:().,' ";

export type SanitizeOptions = {
  maxLen: number;
  /** Erlaubte Zeichen (Satz). Default: „breit". */
  allowed?: string;
};

/**
 * Entfernt nicht erlaubte Zeichen und kürzt auf `maxLen`. Mehrfache Leerzeichen
 * werden zusammengefasst und Rand-Leerzeichen entfernt.
 */
export function sanitize(value: string | null | undefined, opts: SanitizeOptions): string {
  const allowedSet = new Set((opts.allowed ?? WIDE_ALLOWED).split(""));
  const raw = (value ?? "").toString();
  let out = "";
  for (const ch of raw) {
    out += allowedSet.has(ch) ? ch : " ";
  }
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > opts.maxLen) out = out.slice(0, opts.maxLen).trim();
  return out;
}

/** Komfort-Wrapper: breiter Zeichensatz (Name, Verwendungszweck, Bestandsname). */
export function sanitizeWide(value: string | null | undefined, maxLen: number): string {
  return sanitize(value, { maxLen, allowed: WIDE_ALLOWED });
}

/** Komfort-Wrapper: schmaler Zeichensatz (Mandatsreferenz, Zahlungsreferenz). */
export function sanitizeNarrow(value: string | null | undefined, maxLen: number): string {
  return sanitize(value, { maxLen, allowed: NARROW_ALLOWED });
}

/** Formatiert einen Betrag als deutsches Format mit Komma, z. B. 580 → "580,00". */
export function formatAmountDE(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Formatiert ein Datum als TT.MM.JJJJ. Verwendet UTC-Felder, damit das Datum
 * unabhängig von der Serverzeitzone stabil bleibt.
 */
export function formatDateDE(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  return `${d}.${m}.${y}`;
}

/** IBAN normalisieren: Leerzeichen entfernen, Großbuchstaben. */
export function normalizeIban(iban: string | null | undefined): string {
  return (iban ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Erzeugt eine Mandatsreferenz. Schema: "RCWD " + (rotaryMemberId ?? Fallback).
 * Max. 35 Zeichen, KEIN Bindestrich (schmaler Zeichensatz).
 * Fallback aus member.id, nur a-zA-Z0-9.
 */
export function buildMandateRef(
  member: Pick<SepaExportRow, "rotaryMemberId" | "memberId">,
): string {
  const idPart =
    member.rotaryMemberId != null
      ? String(member.rotaryMemberId)
      : (member.memberId ?? "").replace(/[^a-zA-Z0-9]/g, "");
  const ref = `RCWD ${idPart}`;
  return sanitizeNarrow(ref, 35);
}

/**
 * Macht einen Feldwert CSV-sicher, ohne Quoting: ersetzt `;` durch Leerzeichen
 * und entfernt Zeilenumbrüche. So können Felder gefahrlos mit `;` verbunden
 * werden.
 */
function csvSafe(value: string): string {
  return value.replace(/;/g, " ").replace(/[\r\n]+/g, " ");
}

/**
 * Baut den vollständigen CSV-String (Headerzeile + Datenzeilen). Felder sind
 * mit `;` getrennt, Zeilenende ist CRLF. Es wird KEIN CSV-Quoting verwendet;
 * stattdessen werden Semikola/Zeilenumbrüche in allen Feldwerten neutralisiert.
 */
export function buildSepaCsv(
  rows: SepaExportRow[],
  settings: SepaSettings,
  opts: BuildSepaOptions = {},
): string {
  const faelligkeit = opts.faelligkeitsdatum ?? "";
  const bestandsname = sanitizeWide(opts.bestandsname ?? "Beitrag", 35);
  const auftraggeberIban = normalizeIban(settings.auftraggeberIban);
  const creditorId = settings.creditorId.trim();
  const mandateDate = settings.mandateDate.trim();

  const lines: string[] = [SEPA_HEADER_LINE];

  for (const row of rows) {
    const verwendungszweck =
      (row.description && row.description.trim().length > 0
        ? row.description
        : settings.verwendungszweck && settings.verwendungszweck.trim().length > 0
          ? settings.verwendungszweck
          : "Mitgliedsbeitrag") ?? "Mitgliedsbeitrag";

    const fields: string[] = [
      "SDD", // A Auftragsart
      auftraggeberIban, // B Auftraggeber-IBAN
      creditorId, // C Creditor-ID
      "CORE", // D Mandatstyp
      faelligkeit, // E Faelligkeitsdatum
      "J", // F Bestandsbildung
      bestandsname, // G Bestandsname
      "N", // H Einzelbuchung gewuenscht
      formatAmountDE(row.amount), // I Betrag
      normalizeIban(row.memberIban), // J Zahlungspflichtiger-IBAN
      sanitizeWide(`${row.firstName} ${row.lastName}`, 70), // K Name
      buildMandateRef(row), // L Mandatsreferenz
      mandateDate, // M Mandatsausstellungsdatum
      sanitizeWide(verwendungszweck, 140), // N Verwendungszweck
      "", // O Zahlungsreferenz
      "", // P Auftraggeberreferenz
      "", // Q Strasse
      "", // R Hausnummer
      "", // S Tuernummer
      "", // T Postleitzahl
      "", // U Stadt
      "", // V Land
      "", // W Category Purpose Code
      "", // X Purpose Code
      "", // Y Abweichender Auftraggeber Name
      "", // Z Abweichender Zahlungspflichtiger Name
    ];

    lines.push(fields.map(csvSafe).join(";"));
  }

  return lines.join("\r\n");
}
