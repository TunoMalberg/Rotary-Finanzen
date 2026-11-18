import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSepaCsv,
  buildSepaPain008,
  normalizeIban,
  parseGermanDate,
  sanitizeWide,
  type SepaExportRow,
  type SepaSettings,
} from "@/lib/sepaExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "sepa.";

/**
 * Normalisiert ein Fälligkeitsdatum auf das George-Format TT.MM.JJJJ.
 * Akzeptiert `YYYY-MM-DD` oder bereits `TT.MM.JJJJ`. Leerer/ungültiger Wert
 * ergibt einen leeren String (Feld bleibt dann leer).
 */
function normalizeFaelligkeit(raw: string | null): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";
  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }
  // TT.MM.JJJJ
  const de = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (de) return s;
  return "";
}

/**
 * GET /api/sepa/export?clubYearId=...&faelligkeitsdatum=...&preview=1
 *
 * Erzeugt die SEPA-Sammellastschrift (George Business CSV) für alle offenen,
 * per Einzug (SEPA) fälligen Mitgliedsbeiträge eines Clubjahres.
 *
 * Query:
 *   - clubYearId: Pflicht
 *   - faelligkeitsdatum: optional (YYYY-MM-DD oder TT.MM.JJJJ)
 *   - preview: "1" → JSON-Vorschau statt Datei-Download
 *
 * Auth: Schatzmeister/Admin/Auditor (isTreasurer).
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clubYearId = url.searchParams.get("clubYearId");
  const preview = url.searchParams.get("preview") === "1";
  const format = url.searchParams.get("format") === "xml" ? "xml" : "csv";
  const faelligkeitsdatum = normalizeFaelligkeit(
    url.searchParams.get("faelligkeitsdatum"),
  );

  if (!clubYearId) {
    return NextResponse.json(
      { error: "Query-Parameter 'clubYearId' fehlt." },
      { status: 400 },
    );
  }

  // Einstellungen laden.
  const settingRows = await prisma.appSetting.findMany({
    where: { key: { startsWith: PREFIX } },
  });
  const raw: Record<string, string> = {};
  for (const r of settingRows) raw[r.key.slice(PREFIX.length)] = r.value;

  const missingSettings: string[] = [];
  if (!raw.creditorId?.trim()) missingSettings.push("Creditor-ID");
  if (!raw.auftraggeberIban?.trim()) missingSettings.push("Auftraggeber-IBAN");
  if (!raw.mandateDate?.trim()) missingSettings.push("Mandatsausstellungsdatum");

  if (missingSettings.length > 0) {
    return NextResponse.json(
      {
        error: `Fehlende SEPA-Einstellungen: ${missingSettings.join(", ")}. Bitte zuerst unter „SEPA-Einzug" hinterlegen.`,
        missingSettings,
      },
      { status: 400 },
    );
  }

  const settings: SepaSettings = {
    creditorId: raw.creditorId.trim(),
    auftraggeberIban: raw.auftraggeberIban.trim(),
    mandateDate: raw.mandateDate.trim(),
    verwendungszweck: raw.verwendungszweck?.trim() || undefined,
    creditorName: raw.creditorName?.trim() || undefined,
    creditorStreet: raw.creditorStreet?.trim() || undefined,
    creditorPostalCode: raw.creditorPostalCode?.trim() || undefined,
    creditorTown: raw.creditorTown?.trim() || undefined,
    creditorCountry: raw.creditorCountry?.trim() || undefined,
  };

  // Offene SEPA-Beiträge laden.
  const invoices = await prisma.invoice.findMany({
    where: {
      clubYearId,
      type: "DUES",
      paymentMethod: "SEPA",
      status: { in: ["OPEN", "REMINDED"] },
    },
    include: { member: true, clubYear: true },
    orderBy: [{ member: { lastName: "asc" } }, { member: { firstName: "asc" } }],
  });

  const clubYearLabel = invoices[0]?.clubYear.label ?? "";
  // Falls keine Rechnungen: Label separat holen, damit Dateiname/Hinweis stimmt.
  let label = clubYearLabel;
  if (!label) {
    const cy = await prisma.clubYear.findUnique({ where: { id: clubYearId } });
    label = cy?.label ?? "";
  }

  const rows: SepaExportRow[] = [];
  const missingIban: { name: string; reference: string }[] = [];
  let totalAmount = 0;

  for (const inv of invoices) {
    const m = inv.member;
    const iban = normalizeIban(m.iban);
    const name = `${m.lastName}, ${m.firstName}`;
    if (!iban) {
      missingIban.push({ name, reference: inv.reference });
      continue;
    }
    rows.push({
      amount: inv.amount,
      memberIban: iban,
      firstName: m.firstName,
      lastName: m.lastName,
      rotaryMemberId: m.rotaryMemberId,
      memberId: m.id,
      description: inv.description ?? `Mitgliedsbeitrag ${label}`,
      street: m.address,
      postalCode: m.postalCode,
      city: m.city,
      country: m.country,
    });
    totalAmount += inv.amount;
  }

  if (preview) {
    return NextResponse.json({
      clubYearLabel: label,
      count: rows.length,
      totalAmount,
      missingIban,
      settingsOk: true,
    });
  }

  // XML-Variante (pain.008 „Datenträger") für den Standard-Datei-Upload.
  if (format === "xml") {
    const xmlDate = new Date().toISOString().slice(0, 10);
    const xmlLabel = sanitizeWide(label, 35).replace(/[^\w.-]+/g, "-") || "Clubjahr";
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Keine einzuziehenden Beiträge vorhanden (keine offenen SEPA-Forderungen oder alle ohne IBAN)." },
        { status: 400 },
      );
    }
    const collDate = parseGermanDate(faelligkeitsdatum);
    const mandDate = parseGermanDate(settings.mandateDate);
    const cname = settings.creditorName ?? "";
    const xmlMissing: string[] = [];
    if (!cname) xmlMissing.push("Gläubiger-Name");
    if (!collDate) xmlMissing.push("Fälligkeitsdatum");
    if (!mandDate) xmlMissing.push("Mandatsausstellungsdatum (TT.MM.JJJJ)");
    if (xmlMissing.length > 0 || !collDate || !mandDate) {
      return NextResponse.json(
        {
          error: `Für die XML-Datei (pain.008) fehlt: ${xmlMissing.join(", ")}. Das Fälligkeitsdatum ist für die XML Pflicht; den Gläubiger-Namen unter „SEPA-Einzug" hinterlegen.`,
          missingSettings: xmlMissing,
        },
        { status: 400 },
      );
    }
    const xml = buildSepaPain008(rows, settings, {
      collectionDate: collDate,
      mandateDate: mandDate,
      creditorName: cname,
      seqType: "RCUR",
    });
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="SEPA-Einzug_${xmlLabel}_${xmlDate}.xml"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const bestandsname = `Beitrag ${label}`;
  const csv = buildSepaCsv(rows, settings, {
    faelligkeitsdatum,
    bestandsname,
  });

  // UTF-8 mit BOM, damit Excel/George Umlaute korrekt erkennt.
  const body = `﻿${csv}`;

  const safeLabel = sanitizeWide(label, 35).replace(/[^\w.-]+/g, "-") || "Clubjahr";
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `SEPA-Einzug_${safeLabel}_${dateStr}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
