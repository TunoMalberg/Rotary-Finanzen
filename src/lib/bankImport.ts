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
  /** Effektive Spalten-Zuordnung (für UI-Feedback). */
  mapping: HeaderMapping;
  /** Wie wurde die Zuordnung gefunden? */
  mappingSource: "heuristic" | "ai" | "mixed";
};

/** Wie wir Header auf unsere normalisierten Felder mappen. */
export type HeaderMapping = {
  /** Index der Spalte mit dem Buchungsdatum. */
  date: number;
  valueDate: number;
  /** Genau einer von amount ODER (amountIn + amountOut) ist > -1. */
  amount: number;
  amountIn: number;
  amountOut: number;
  currency: number;
  purpose: number;
  counterparty: number;
  partnerIban: number;
  externalRef: number;
  statementRef: number;
  paymentRef: number;
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
  // Suche die Header-Zeile: enthält "Buchungsdatum"/"Datum"/"Buchungstag"
  // ODER eine Zeile mit ≥ 5 nicht-leeren String-Zellen, die typische Bank-Header-Wörter
  // enthält (Betrag/IBAN/Verwendungszweck/Empfänger/Eingehender/Ausgehender). Damit fangen
  // wir auch Exporte ab, die "Datum" anders nennen oder leichte Abwandlungen.
  let headerIdx = -1;
  const HEADER_HINTS = /betrag|iban|empf[aä]nger|auftraggeber|verwendung|partner|buchung|valuta|w[aä]hrung|eingehend|ausgehend|kontoauszug|referenz|datum/i;
  for (let i = 0; i < Math.min(all.length, 50); i++) {
    const r = all[i] ?? [];
    const strCells = r.filter((c) => typeof c === "string" && c.trim().length > 0) as string[];
    const hasDateHeader = strCells.some((c) =>
      /^(buchungsdatum|datum|buchungstag)$/i.test(c.trim()),
    );
    const looksLikeHeader =
      strCells.length >= 5 &&
      strCells.filter((c) => HEADER_HINTS.test(c)).length >= 3;
    if (hasDateHeader || looksLikeHeader) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0)
    throw new Error(
      "Header-Zeile (Buchungsdatum/Datum) nicht gefunden – ist die Datei korrekt? Erste 5 Zeilen: " +
        all
          .slice(0, 5)
          .map((r, i) =>
            `Z${i}: ${(r ?? []).slice(0, 6).map((c) => (c == null ? "" : String(c).slice(0, 30))).join(" | ")}`,
          )
          .join("  ‖  "),
    );
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

  // Heuristische Spalten-Zuordnung
  let mapping: HeaderMapping = detectMappingHeuristic(headers);
  let mappingSource: "heuristic" | "ai" | "mixed" = "heuristic";

  // Wenn essenzielle Felder fehlen → KI-Fallback (falls OPENAI_API_KEY gesetzt)
  if (mapping.date < 0 || (mapping.amount < 0 && mapping.amountIn < 0 && mapping.amountOut < 0)) {
    if (process.env.OPENAI_API_KEY) {
      try {
        const ai = await detectMappingWithAI(headers, rawRows.slice(0, 3));
        // Merge: AI füllt nur die Lücken
        const merged: HeaderMapping = { ...mapping };
        for (const k of Object.keys(merged) as (keyof HeaderMapping)[]) {
          if (merged[k] < 0 && ai[k] >= 0) merged[k] = ai[k];
        }
        mapping = merged;
        mappingSource = "mixed";
      } catch (e) {
        // KI nicht verfügbar → wir fallen unten in den deterministischen Fehler
        console.warn("[bankImport] AI mapping failed:", e);
      }
    }
  }

  if (
    mapping.date < 0 ||
    (mapping.amount < 0 && mapping.amountIn < 0 && mapping.amountOut < 0)
  ) {
    throw new Error(
      `Spalten 'Buchungsdatum' und 'Betrag' (oder 'Eingehender Betrag'/'Ausgehender Betrag') nicht gefunden. Erkannte Header: ${headers.filter((h) => h && h.trim()).join(" | ")}`,
    );
  }

  const parsed: ParsedRow[] = [];
  for (const r of rawRows) {
    if (!r || r.every((c) => c == null || (typeof c === "string" && !c.trim()))) continue;
    const date = parseAnyDate(r[mapping.date]);
    if (!date) continue;

    // Betrag bestimmen:
    //  1. Vorzugsfeld: Eingehender + Ausgehender (in der Praxis ist immer nur eins gefüllt)
    //  2. Sonst Single-Betrag (alte CSV / Originalbetrag)
    let amount = 0;
    if (mapping.amountIn >= 0 || mapping.amountOut >= 0) {
      const inV = mapping.amountIn >= 0 ? parseAnyNumber(r[mapping.amountIn]) : 0;
      const outV = mapping.amountOut >= 0 ? parseAnyNumber(r[mapping.amountOut]) : 0;
      // Outgoing ist meist schon negativ; falls jemand absolute Werte schickt, machen wir's negativ.
      const outSigned = outV > 0 ? -outV : outV;
      amount = inV !== 0 ? inV : outSigned;
    } else if (mapping.amount >= 0) {
      amount = parseAnyNumber(r[mapping.amount]);
    }
    if (amount === 0) continue;

    const valueDate = mapping.valueDate >= 0 ? parseAnyDate(r[mapping.valueDate]) : null;
    const purposeMain = mapping.purpose >= 0 ? String(r[mapping.purpose] ?? "").trim() : "";
    const purposeFallback = mapping.paymentRef >= 0 ? String(r[mapping.paymentRef] ?? "").trim() : "";
    const purpose = purposeMain || purposeFallback || null;
    const counterparty = mapping.counterparty >= 0 ? String(r[mapping.counterparty] ?? "").trim() || null : null;
    const currency =
      (mapping.currency >= 0 ? String(r[mapping.currency] ?? "").trim() : "EUR").toUpperCase() || "EUR";
    const externalRef = mapping.externalRef >= 0 ? String(r[mapping.externalRef] ?? "").trim() || null : null;
    const partnerIban = mapping.partnerIban >= 0 ? String(r[mapping.partnerIban] ?? "").trim() || null : null;
    const statementRef = mapping.statementRef >= 0 ? String(r[mapping.statementRef] ?? "").trim() || null : null;

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

  return { rows: parsed, source, headers, mapping, mappingSource };
}

/* ------------------------ Heuristische Header-Erkennung ------------------------ */

function detectMappingHeuristic(headers: string[]): HeaderMapping {
  return {
    date: findIdx(headers, [
      "Buchungsdatum",
      "Buchungstag",
      "Datum",
      "Datum Buchung",
      "Buchung",
    ]),
    valueDate: findIdx(headers, [
      "Durchführungsdatum",
      "Durchfuehrungsdatum",
      "Valutadatum",
      "Valuta",
      "Wertstellung",
    ]),
    // single-amount Spalten (ältere George-CSVs / Originalbetrag)
    amount: findIdx(headers, ["Betrag", "Umsatz", "Wert", "Originalbetrag"]),
    // neue George XLSX-Spalten (separat)
    amountIn: findIdx(headers, [
      "Eingehender Betrag",
      "Eingang",
      "Haben",
      "Gutschrift",
      "Credit",
    ]),
    amountOut: findIdx(headers, [
      "Ausgehender Betrag",
      "Ausgang",
      "Soll",
      "Belastung",
      "Lastschrift",
      "Debit",
    ]),
    currency: findIdx(headers, ["Währung", "Waehrung", "Currency", "Originalwährung"]),
    purpose: findIdx(headers, [
      "Buchungs-Details",
      "BuchungsDetails",
      "Verwendungszweck",
      "Buchungstext",
      "Text",
      "Beschreibung",
    ]),
    counterparty: findIdx(headers, [
      "Partner Name",
      "Partnername",
      "Auftraggeber",
      "Empfänger",
      "Empfaenger",
      "Begünstigter",
      "Beguenstigter",
      "Gegenpartei",
      "Empfänger/Auftraggeber",
      "Auftraggeber/Empfänger",
      "Name",
    ]),
    partnerIban: findIdx(headers, [
      "Partner IBAN",
      "PartnerIBAN",
      "IBAN",
      "Gegenkonto",
      "Konto Empfänger",
    ]),
    externalRef: findIdx(headers, [
      "Buchungsreferenz",
      "BuchungsReferenz",
      "Transaktionsreferenz",
      "Referenz",
      "(Sammel-) Überweisung ID",
      "Sammel-Überweisung ID",
      "Überweisung ID",
    ]),
    statementRef: findIdx(headers, [
      "Kontoauszug / Rechnung",
      "KontoauszugRechnung",
      "Kontoauszug",
      "Auszug",
    ]),
    paymentRef: findIdx(headers, [
      "Zahlungsreferenz",
      "PaymentReference",
      "Notiz",
    ]),
  };
}

/* ------------------------------- KI-Fallback ------------------------------- */

/**
 * Fragt OpenAI, welche Header auf unsere Felder gemappt werden sollen.
 * Wird nur aufgerufen, wenn die heuristische Erkennung essenzielle Felder
 * NICHT findet. Erfordert `OPENAI_API_KEY` als ENV-Variable.
 *
 * Liefert Indizes (-1 wenn nicht gefunden).
 */
async function detectMappingWithAI(
  headers: string[],
  sampleRows: unknown[][],
): Promise<HeaderMapping> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nicht gesetzt");

  const sample = sampleRows.slice(0, 3).map((row) =>
    row.slice(0, headers.length).map((cell) => {
      if (cell == null) return "";
      const s = String(cell);
      return s.length > 40 ? s.slice(0, 37) + "…" : s;
    }),
  );

  const prompt = `Du erhältst die Kopfzeile eines deutschsprachigen Bank-Kontoauszug-Exports (z. B. von der österreichischen Bank "George"/Erste Bank) und 1-3 Beispielzeilen. Du sollst jeder unserer Zielspalten den passenden Header-Index zuordnen (0-basiert) oder -1 wenn nicht vorhanden.

Zielspalten (deutsch, Erklärung):
- date          : Buchungsdatum
- valueDate     : Valutadatum/Wertstellung/Durchführungsdatum
- amount        : signierter Betrag (positiv=Gutschrift, negativ=Lastschrift) – nur falls EINE Spalte
- amountIn      : Eingehender Betrag (Gutschrift, separat)
- amountOut     : Ausgehender Betrag (Lastschrift, separat) – meist bereits negativ
- currency      : Währungs-Code (EUR/USD)
- purpose       : Verwendungszweck/Buchungs-Details
- counterparty  : Name des Partners (Empfänger/Auftraggeber)
- partnerIban   : IBAN des Partners
- externalRef   : eindeutige Buchungsreferenz der Bank
- statementRef  : Kontoauszug-/Rechnungsnummer
- paymentRef    : Zahlungsreferenz/Notiz (Fallback-Zweck)

Header (mit Index):
${headers.map((h, i) => `${i}: ${h}`).join("\n")}

Beispielzeilen (gleiche Spalten-Reihenfolge):
${sample.map((r, i) => `Zeile ${i + 1}: ${r.join(" | ")}`).join("\n")}

Antworte AUSSCHLIEßLICH mit einem JSON-Objekt der Form:
{"date":4,"valueDate":-1,"amount":-1,"amountIn":23,"amountOut":24,"currency":13,"purpose":20,"counterparty":8,"partnerIban":9,"externalRef":21,"statementRef":7,"paymentRef":31}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MAPPING_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Partial<HeaderMapping>;

  const safe = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 && n < headers.length ? n : -1;
  };
  return {
    date: safe(parsed.date),
    valueDate: safe(parsed.valueDate),
    amount: safe(parsed.amount),
    amountIn: safe(parsed.amountIn),
    amountOut: safe(parsed.amountOut),
    currency: safe(parsed.currency),
    purpose: safe(parsed.purpose),
    counterparty: safe(parsed.counterparty),
    partnerIban: safe(parsed.partnerIban),
    externalRef: safe(parsed.externalRef),
    statementRef: safe(parsed.statementRef),
    paymentRef: safe(parsed.paymentRef),
  };
}