import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Erlaubte SEPA-Einstellungs-Keys (ohne `sepa.`-Präfix). */
const ALLOWED_KEYS = [
  "creditorId",
  "creditorName",
  "creditorStreet",
  "creditorPostalCode",
  "creditorTown",
  "creditorCountry",
  "auftraggeberIban",
  "mandateDate",
  "verwendungszweck",
] as const;
type SepaKey = (typeof ALLOWED_KEYS)[number];

const PREFIX = "sepa.";

/**
 * GET /api/sepa/settings
 *
 * Liefert alle `sepa.*`-Einstellungen als flaches Objekt (ohne Präfix). Ist die
 * Auftraggeber-IBAN noch nicht gesetzt, wird als Vorschlag die IBAN des
 * MAIN-Kontos zurückgegeben (Feld `auftraggeberIbanSuggested`).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: PREFIX } },
  });

  const settings: Record<string, string> = {};
  for (const r of rows) {
    const short = r.key.slice(PREFIX.length);
    settings[short] = r.value;
  }

  // Default-Vorschlag für Auftraggeber-IBAN aus dem MAIN-Konto.
  let auftraggeberIbanSuggested = "";
  if (!settings.auftraggeberIban) {
    const main = await prisma.account.findFirst({
      where: { type: "MAIN", iban: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    auftraggeberIbanSuggested = main?.iban ?? "";
  }

  return NextResponse.json({
    settings: {
      creditorId: settings.creditorId ?? "",
      creditorName: settings.creditorName ?? "",
      creditorStreet: settings.creditorStreet ?? "",
      creditorPostalCode: settings.creditorPostalCode ?? "",
      creditorTown: settings.creditorTown ?? "",
      creditorCountry: settings.creditorCountry ?? "",
      auftraggeberIban: settings.auftraggeberIban ?? "",
      mandateDate: settings.mandateDate ?? "",
      verwendungszweck: settings.verwendungszweck ?? "",
    },
    auftraggeberIbanSuggested,
  });
}

/**
 * PUT /api/sepa/settings
 *
 * Body = Objekt mit einer Teilmenge der Keys creditorId, auftraggeberIban,
 * mandateDate, verwendungszweck. Jeder übergebene Key wird unter `sepa.<key>`
 * per upsert gespeichert.
 */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const updates: { key: SepaKey; value: string }[] = [];
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key] == null ? "" : String(body[key]).trim();
      updates.push({ key, value });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: "Keine gültigen Felder übergeben." },
      { status: 400 },
    );
  }

  for (const { key, value } of updates) {
    const fullKey = `${PREFIX}${key}`;
    await prisma.appSetting.upsert({
      where: { key: fullKey },
      create: { key: fullKey, value },
      update: { value },
    });
  }

  return NextResponse.json({ ok: true, saved: updates.map((u) => u.key) });
}
