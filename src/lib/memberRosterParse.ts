/**
 * Parser für Mitgliederlisten – akzeptiert zwei Excel-Formate:
 *
 * 1) **ClubRoster** (neues Rotary-Export-Format, Sheet "Mitgliederverzeichnis")
 *    - Abschnittsüberschriften ("Aktivmitglieder", "Ehrenmitglieder", …)
 *    - Header: "Mitgliedsnummer | Vorname | Nachname | Clubbeitritt |
 *              Ursprüngliches Beitrittsdatum | Adresse | Stadt/Land |
 *              Postleitzahl | Telefon | E-mail | Online-Account bei Mein Rotary
 *              | Altersangaben verfügbar | Mitglied eines Satelliten-Clubs"
 *    - Keine SEPA-/Befreiungsspalten → diese Felder werden beim Update
 *      bestehender Mitglieder NICHT überschrieben.
 *
 * 2) **MB** (altes EAR-Membership-Sheet, "Member ID" als Header-Marker)
 *    - Spalten: 1=EZ/Befreit-Flag, 2=Member ID, 3=Name, 5=Adresse, 6=Stadt,
 *      8=PLZ, 9=Land, 11/12/13=Telefonarten.
 */
import * as XLSX from "xlsx";

export type RosterRow = {
  rotaryMemberId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  joinedAt: Date | null;
  /** Sektion aus dem ClubRoster, z. B. "Aktivmitglieder" oder
   *  "Ehrenmitglieder". Steuert den Status. */
  section: string | null;
  /** Aus alten MB-Sheets: SEPA-Einzug-Flag (NUR setzen, nicht im Update
   *  überschreiben, falls null aus Roster). */
  paysBySEPA: boolean | null;
  /** Aus alten MB-Sheets: Befreiungs-Flag (analog). */
  isExempt: boolean | null;
  /** Notizen aus dem MB-Sheet (z. B. "Befreit/Ehrenmitglied"). */
  notes: string | null;
};

export type ParsedRoster = {
  format: "ClubRoster" | "MB" | "unknown";
  sheetName: string | null;
  rows: RosterRow[];
};

/* -------------------- Helpers -------------------- */

/**
 * Wandelt Excel-Datums-Werte (Datumsserial-Number oder echte Date-Instanz) in
 * UTC-Date um. NULL-/leer-Werte → null.
 */
function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "number") {
    // Excel-Serial → UTC. xlsx liefert mit cellDates:true direkt Date-Objekte;
    // wenn nicht, manuelle Umrechnung (1900-Datums-Basis, Lotus 1-2-3 Bug).
    const epoch = Date.UTC(1899, 11, 30); // 30.12.1899 (Excel-Serial 0)
    const ms = epoch + v * 86400 * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

/**
 * Splittet "Stadt, Land" oder "Stadt,, Land" → { city, country }.
 * Doppelte Kommas (Tippfehler im Roster) werden geglättet.
 */
function splitCityCountry(raw: string | null): { city: string | null; country: string | null } {
  if (!raw) return { city: null, country: null };
  const cleaned = raw.replace(/,+/g, ",").trim();
  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null };
  if (parts.length === 1) return { city: parts[0], country: null };
  return { city: parts.slice(0, -1).join(", "), country: parts[parts.length - 1] };
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/* -------------------- ClubRoster parser -------------------- */

/**
 * Findet die Spaltenindizes für die ClubRoster-Header-Zeile. Toleriert
 * abweichende Reihenfolgen und zusätzliche Leerspalten.
 */
function findColumns(headerRow: unknown[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const v = headerRow[i];
    if (typeof v !== "string") continue;
    const k = v.trim().toLowerCase();
    if (k === "mitgliedsnummer") idx.id = i;
    else if (k === "vorname") idx.first = i;
    else if (k === "nachname") idx.last = i;
    else if (k === "clubbeitritt") idx.joined = i;
    else if (k.startsWith("ursprüngliches beitritts") || k.startsWith("urspruengliches beitritts")) idx.origJoined = i;
    else if (k === "adresse") idx.address = i;
    else if (k.startsWith("stadt")) idx.city = i;
    else if (k.startsWith("postleit") || k === "plz") idx.postal = i;
    else if (k === "telefon") idx.phone = i;
    else if (k === "e-mail" || k === "email" || k === "e mail") idx.email = i;
  }
  return idx;
}

function parseClubRosterSheet(rows: unknown[][]): RosterRow[] {
  const out: RosterRow[] = [];
  let currentSection: string | null = null;
  let cols: Record<string, number> | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];

    // Detect "section heading": exactly one non-empty cell (e.g., "Aktivmitglieder")
    const nonEmpty = r.filter((c) => c !== null && c !== "" && c !== undefined);
    if (nonEmpty.length === 1 && typeof nonEmpty[0] === "string") {
      const heading = (nonEmpty[0] as string).trim();
      // Sektionsüberschriften können doppelt vorkommen (Layout-Quirk Excel)
      if (/mitglied|active|gast|ehrenmitglied/i.test(heading)) {
        currentSection = heading;
      }
      continue;
    }

    // Detect ClubRoster header row by "Mitgliedsnummer"
    if (r.includes("Mitgliedsnummer")) {
      cols = findColumns(r);
      continue;
    }

    if (!cols || cols.id == null) continue;

    const rawId = r[cols.id];
    const idNum =
      typeof rawId === "number"
        ? rawId
        : typeof rawId === "string" && /^\d+$/.test(rawId.trim())
          ? Number(rawId.trim())
          : null;

    const first = strOrNull(r[cols.first ?? -1]) ?? "";
    const last = strOrNull(r[cols.last ?? -1]) ?? "";
    if (!last && !first) continue; // keine Datenzeile

    const cityCountryRaw = strOrNull(r[cols.city ?? -1]);
    const { city, country } = splitCityCountry(cityCountryRaw);

    out.push({
      rotaryMemberId: idNum,
      firstName: first.trim(),
      lastName: last.trim(),
      email: strOrNull(r[cols.email ?? -1]),
      phone: strOrNull(r[cols.phone ?? -1]),
      address: strOrNull(r[cols.address ?? -1]),
      city,
      postalCode: strOrNull(r[cols.postal ?? -1]),
      country: country ?? "Austria",
      joinedAt: toDate(r[cols.joined ?? -1]) ?? toDate(r[cols.origJoined ?? -1]),
      section: currentSection,
      paysBySEPA: null,
      isExempt: null,
      notes: null,
    });
  }
  return out;
}

/* -------------------- Legacy MB parser -------------------- */

function parseMBSheet(rows: unknown[][]): RosterRow[] {
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (Array.isArray(r) && r.includes("Member ID")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const out: RosterRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = (rows[i] ?? []) as (string | number | null)[];
    const memberCol = r[2];
    const nameRaw = r[3];
    if (!nameRaw || typeof nameRaw !== "string" || !nameRaw.trim()) continue;

    const flag2 = r[1];
    const flag2Str = flag2 ? String(flag2) : "";
    const paysBySEPA = /\bEZ\b/i.test(flag2Str);
    const isExempt = /Befreit/i.test(flag2Str);

    const name = nameRaw.trim();
    let firstName = "";
    let lastName = "";
    if (name.includes(",")) {
      const [l, f] = name.split(",");
      lastName = l.trim();
      firstName = (f ?? "").trim();
    } else {
      const parts = name.split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    if (!lastName) lastName = firstName;

    out.push({
      rotaryMemberId: typeof memberCol === "number" ? memberCol : null,
      firstName,
      lastName,
      email: null,
      phone: strOrNull(r[13]) ?? strOrNull(r[11]) ?? strOrNull(r[12]),
      address: strOrNull(r[5]),
      city: strOrNull(r[6]),
      postalCode: r[8] != null ? String(r[8]) : null,
      country: strOrNull(r[9]) ?? "Austria",
      joinedAt: null,
      section: null,
      paysBySEPA,
      isExempt,
      notes: flag2Str.length > 6 ? flag2Str : null,
    });
  }
  return out;
}

/* -------------------- Public entry -------------------- */

export function parseMemberRoster(buf: ArrayBuffer | Uint8Array | Buffer): ParsedRoster {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

  // Format 1: neues ClubRoster (Sheet "Mitgliederverzeichnis")
  const rosterSheetName = wb.SheetNames.find(
    (n) => n.toLowerCase() === "mitgliederverzeichnis",
  );
  if (rosterSheetName) {
    const ws = wb.Sheets[rosterSheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });
    const parsed = parseClubRosterSheet(rows);
    if (parsed.length > 0) {
      return { format: "ClubRoster", sheetName: rosterSheetName, rows: parsed };
    }
  }

  // Format 2: altes MB-Sheet (in EAR-Excel)
  const mbSheetName = wb.Sheets["MB"] ? "MB" : null;
  if (mbSheetName) {
    const ws = wb.Sheets[mbSheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    });
    const parsed = parseMBSheet(rows);
    if (parsed.length > 0) {
      return { format: "MB", sheetName: mbSheetName, rows: parsed };
    }
  }

  // Fallback: erstes Sheet auf beide Formate testen
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });
    const a = parseClubRosterSheet(rows);
    if (a.length > 0) return { format: "ClubRoster", sheetName: n, rows: a };
    const b = parseMBSheet(rows);
    if (b.length > 0) return { format: "MB", sheetName: n, rows: b };
  }
  return { format: "unknown", sheetName: null, rows: [] };
}

/**
 * Mappt die Roster-Sektion auf einen Member-Status.
 * "Aktivmitglieder" / null → ACTIVE,
 * "Ehrenmitglieder" → EXEMPT (zahlt keinen Beitrag),
 * sonst ACTIVE.
 */
export function statusFromSection(section: string | null): "ACTIVE" | "INACTIVE" | "EXEMPT" {
  if (!section) return "ACTIVE";
  const s = section.toLowerCase();
  if (s.includes("ehren")) return "EXEMPT";
  if (s.includes("inaktiv") || s.includes("ausgeschieden")) return "INACTIVE";
  return "ACTIVE";
}