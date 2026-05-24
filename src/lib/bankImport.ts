/**
 * Unified Bank-Import-Parser
 * Unterstützt CSV (George/Erste, deutsches Format) und XLSX (George Erste-Bank-Export).
 *
 * Liefert eine normalisierte Liste von Buchungen unabhängig vom Quellformat.
 */
import * as XLSX from "xlsx";
import { parseCSV } from "./csvParse";
import { parseGermanNumber } from "./format";

export type ParsedRow = {
  /** Buchungsdatum (UTC, 00:00) */
  date: Date;
  /** Valuta-/Durchführungsdatum (optional, UTC 00:00) */
  valueDate: Date | null;
  /** Partner Name / Auftraggeber / Empfänger */
  counterparty: string | null;
  /** Verwendungszweck / Buchungs-Details */
  purpose: string | null;
  /** Betrag in EUR (positive = Eingang, negative = Ausgang) */
  amount: number;
  /** Währung (EUR-Filter, Default EUR) */
  currency: string;
  /** Eindeutige Bank-Buchungsreferenz (z. B. George "Buchungsreferenz") */
  externalRef: string | null;
  /** Partner IBAN (optional, fällt zurück auf "Gegenkonto") */
  partnerIban: string | null;
  /** Kontoauszug-Nummer (z. B. "2026/00050") */
  statementRef: string | null;
};

export type ParseResult = {
  rows: ParsedRow[];
  source: "csv" | "xlsx";
  /** Originale Header-Zeile, hilft bei Diagnose/Fehlern */
  headers: string[];
};

/* ----------------------------- Utilities ----------------------------- */

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[/.\-_]/g, "");
}

function findIdx(headers: string[], candidates: string[]): number {
  const norm = headers.map(normHeader);
  for (const c of candidates) {
    const idx = norm.indexOf(normHeader(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Excel-Seriendatum → UTC-Date (00:00). Excel zählt ab 30.12.1899. */
function excelSerialToDate(n: number): Date {
  // Tagesanteil (vor Komma) + Excel-Bug für 1900 (Schalttag)
  const days = Math.floor(n);
  const ms = (days - 25569) * 86400 * 1000;
  return new Date(ms);
}

function parseAnyDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return excelSerialToDate(v);
  }
  const s = String(v).trim();
  if (!s) return null;
  // dd.MM.yyyy / dd/MM/yyyy / dd-MM-yyyy
  const m1 = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]);
    const y = m1[3].length === 2 ? 2000 + Number(m1[3]) : Number(m1[3]);
    return new Date(Date.UTC(y, mo - 1, d));
  }
  // yyyy-MM-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3])));
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Akzeptiert sowohl deutsche (1.234,56) als auch englische (1,234.56)
 * Zahlenformate. XLSX-Roh-Werte werden direkt als number durchgereicht.
 */
function parseAnyNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  // Heuristik: enthält sowohl . als auch , → Format anhand Position bestimmen
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      // deutsches Format: 1.234,56
      return parseGermanNumber(s);
    }
    // englisches Format: 1,234.56 → Tausender-Komma weg
    const cleaned = s.replace(/[^0-9.\-+]/g, "").replace(/,/g, "");
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  if (lastComma >= 0 && lastDot < 0) {
    // nur Komma → deutsches Dezimal
    return parseGermanNumber(s);
  }
  // nur Punkt oder gar nichts → englisch / int
  const cleaned = s.replace(/[^0-9.\-+]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/* ----------------------------- XLSX-Parser ----------------------------- */

function rowsFromXlsx(buf: ArrayBuffer): { rows: unknown[][]; headerIdx: number; headers: string[] } {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("XLSX enthält keine Tabellen.");
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  // Suche die Header-Zeile: enthält "Buchungsdatum" oder "Datum"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(all.length, 30); i++) {
    const r = all[i] ?? [];
    if (r.some((c) => typeof c === "string" && /^buchungsdatum$|^datum$|^buchungstag$/i.test(c.trim()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Header-Zeile (Buchungsdatum/Datum) nicht gefunden.");
  const headers = (all[headerIdx] as unknown[]).map((c) => (c == null ? "" : String(c).trim()));
  return { rows: all.slice(headerIdx + 1), headerIdx, headers };
}

/* ----------------------------- CSV-Parser ----------------------------- */

function rowsFromCsv(text: string): { rows: string[][]; headers: string[] } {
  const all = parseCSV(text);
  if (all.length < 2) throw new Error("Datei enthält keine Daten.");
  // Suche Header-Zeile (manche Bank-CSV haben Vor-Header)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(all.length, 20); i++) {
    if (all[i].some((c) => /^buchungsdatum$|^datum$|^buchungstag$/i.test(c.trim()))) {
      headerIdx = i;
      break;
    }
  }
  return {
    rows: all.slice(headerIdx + 1),
    headers: all[headerIdx].map((h) => h.trim()),
  };
}

/* ----------------------------- Hauptfunktion ----------------------------- */

/**
 * Erkennt CSV vs. XLSX anhand Dateiname-Endung & MIME, parst und mappt
 * auf normalisierte ParsedRow[].
 */
export async function parseBankFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  const isXlsx = /\.xlsx?$/i.test(name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel";

  let rawRows: unknown[][];
  let headers: string[];
  let source: "csv" | "xlsx";

  if (isXlsx) {
    const buf = await file.arrayBuffer();
    const r = rowsFromXlsx(buf);
    rawRows = r.rows;
    headers = r.headers;
    source = "xlsx";
  } else {
    const text = await file.text();
    const r = rowsFromCsv(text);
    rawRows = r.rows;
    headers = r.headers;
    source = "csv";
  }

  // Spalten-Indizes (tolerant)
  const dateIdx = findIdx(headers, ["Buchungsdatum", "Buchungstag", "Datum", "Datum Buchung", "Buchung"]);
  const valueIdx = findIdx(headers, ["Durchführungsdatum", "Durchfuehrungsdatum", "Valutadatum", "Valuta", "Wertstellung"]);
  const amountIdx = findIdx(headers, ["Betrag", "Umsatz", "Wert"]);
  const currencyIdx = findIdx(headers, ["Währung", "Waehrung", "Currency"]);
  const purposeIdx = findIdx(headers, [
    "Buchungs-Details", "BuchungsDetails", "Verwendungszweck", "Buchungstext", "Text",
  ]);
  const counterpartyIdx = findIdx(headers, [
    "Partner Name", "Partnername", "Auftraggeber", "Empfänger", "Empfaenger",
    "Begünstigter", "Beguenstigter", "Gegenpartei",
    "Empfänger/Auftraggeber", "Auftraggeber/Empfänger",
  ]);
  const ibanIdx = findIdx(headers, ["Partner IBAN", "PartnerIBAN", "IBAN", "Gegenkonto", "Konto Empfänger"]);
  const refIdx = findIdx(headers, ["Buchungsreferenz", "BuchungsReferenz", "Transaktionsreferenz", "Referenz"]);
  const stmtIdx = findIdx(headers, ["Kontoauszug / Rechnung", "KontoauszugRechnung", "Kontoauszug"]);
  // Zahlungsreferenz als Fallback-Verwendungszweck
  const payRefIdx = findIdx(headers, ["Zahlungsreferenz", "PaymentReference"]);

  if (dateIdx < 0 || amountIdx < 0) {
    throw new Error(`Spalten 'Buchungsdatum' und 'Betrag' nicht gefunden. Erkannte Header: ${headers.join(", ")}`);
  }

  const parsed: ParsedRow[] = [];
  for (const r of rawRows) {
    if (!r || r.every((c) => c == null || (typeof c === "string" && !c.trim()))) continue;
    const date = parseAnyDate(r[dateIdx]);
    const amount = parseAnyNumber(r[amountIdx]);
    if (!date || amount === 0) continue;

    const valueDate = valueIdx >= 0 ? parseAnyDate(r[valueIdx]) : null;
    const purposeMain = purposeIdx >= 0 ? String(r[purposeIdx] ?? "").trim() : "";
    const purposeFallback = payRefIdx >= 0 ? String(r[payRefIdx] ?? "").trim() : "";
    const purpose = purposeMain || purposeFallback || null;
    const counterparty = counterpartyIdx >= 0 ? (String(r[counterpartyIdx] ?? "").trim() || null) : null;
    const currency = (currencyIdx >= 0 ? String(r[currencyIdx] ?? "").trim() : "EUR").toUpperCase() || "EUR";
    const externalRef = refIdx >= 0 ? (String(r[refIdx] ?? "").trim() || null) : null;
    const partnerIban = ibanIdx >= 0 ? (String(r[ibanIdx] ?? "").trim() || null) : null;
    const statementRef = stmtIdx >= 0 ? (String(r[stmtIdx] ?? "").trim() || null) : null;

    parsed.push({
      date,
      valueDate,
      counterparty,
      purpose,
      amount,
      currency,
      externalRef,
      partnerIban,
      statementRef,
    });
  }

  return { rows: parsed, source, headers };
}