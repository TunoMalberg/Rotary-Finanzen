import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cashflow/daily-balance?from=YYYY-MM-DD[&to=YYYY-MM-DD]
 *
 * Liefert die tagesgenaue Entwicklung des Gesamtvermögens
 * (Hauptkonto + Global Grant) zwischen `from` und `to` (inkl.).
 *
 * Berechnung:
 *  - Eröffnungs-Saldo des frühesten Clubjahrs als absoluter Anfangssaldo.
 *  - Alle Buchungen aller Clubjahre werden chronologisch summiert.
 *  - `startBalance` = Anfangssaldo + Σ Buchungen mit Datum < from
 *  - Anschließend wird für jeden Tag im Bereich [from, to] der Saldo
 *    nach Anwendung der Tages-Buchungen ausgegeben.
 *
 * Liefert für jeden Tag drei Salden:
 *  - main: nur Hauptkonto
 *  - gg:   nur Global Grant
 *  - total: Summe (= „Gesamtvermögen")
 *
 * Wenn `to` fehlt → heute. Wenn `from` fehlt → erster Tag des aktuellen
 * Clubjahres. Maximaler Bereich: 6 Jahre.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  // Konten
  const [mainAcc, ggAcc] = await Promise.all([
    prisma.account.findFirst({ where: { type: "MAIN" }, select: { id: true } }),
    prisma.account.findFirst({ where: { type: "GLOBAL_GRANT_TRUST" }, select: { id: true } }),
  ]);
  if (!mainAcc || !ggAcc) {
    return NextResponse.json(
      { error: "Konten (MAIN / GLOBAL_GRANT_TRUST) nicht gefunden." },
      { status: 500 },
    );
  }

  // Frühestes Clubjahr → absoluter Anfangssaldo
  const earliest = await prisma.clubYear.findFirst({
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      openingBalanceMain: true,
      openingBalanceGG: true,
    },
  });
  if (!earliest) {
    return NextResponse.json(
      { error: "Kein Clubjahr vorhanden." },
      { status: 404 },
    );
  }

  // Default-Range
  const from = fromStr ? parseDateUtc(fromStr) : startOfDayUtc(earliest.startsAt);
  const to = toStr ? parseDateUtc(toStr) : startOfDayUtc(new Date());
  if (!from || !to) {
    return NextResponse.json({ error: "ungültiges Datum" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from > to" }, { status: 400 });
  }
  const daysSpan = Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000)) + 1;
  const MAX_DAYS = 366 * 6;
  if (daysSpan > MAX_DAYS) {
    return NextResponse.json(
      { error: `Bereich zu groß (max ${MAX_DAYS} Tage).` },
      { status: 400 },
    );
  }

  // Alle Buchungen (für beide Konten, egal welches Jahr) bis einschl. `to`.
  const txs = await prisma.transaction.findMany({
    where: {
      accountId: { in: [mainAcc.id, ggAcc.id] },
      deletedAt: null,
      date: { lte: endOfDayUtc(to) },
    },
    select: { date: true, amount: true, accountId: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  // Aggregate pro Tag (lokal-Datums-Schlüssel YYYY-MM-DD, UTC-basiert)
  const dayDeltas = new Map<string, { main: number; gg: number }>();
  let preMainBefore = earliest.openingBalanceMain;
  let preGgBefore = earliest.openingBalanceGG;
  for (const t of txs) {
    const dayKey = isoDate(startOfDayUtc(t.date));
    const isMain = t.accountId === mainAcc.id;
    if (startOfDayUtc(t.date) < from) {
      // vor dem Anzeige-Bereich → in startBalance einfließen lassen
      if (isMain) preMainBefore += t.amount;
      else preGgBefore += t.amount;
      continue;
    }
    const cur = dayDeltas.get(dayKey) ?? { main: 0, gg: 0 };
    if (isMain) cur.main += t.amount;
    else cur.gg += t.amount;
    dayDeltas.set(dayKey, cur);
  }

  // Tagesserie aufbauen
  let runMain = preMainBefore;
  let runGg = preGgBefore;
  const series: Array<{
    date: string;
    main: number;
    gg: number;
    total: number;
    delta: number;
  }> = [];

  for (let d = new Date(from); d <= to; d = addDaysUtc(d, 1)) {
    const dayKey = isoDate(d);
    const delta = dayDeltas.get(dayKey);
    if (delta) {
      runMain += delta.main;
      runGg += delta.gg;
    }
    series.push({
      date: dayKey,
      main: round2(runMain),
      gg: round2(runGg),
      total: round2(runMain + runGg),
      delta: round2((delta?.main ?? 0) + (delta?.gg ?? 0)),
    });
  }

  return NextResponse.json({
    from: isoDate(from),
    to: isoDate(to),
    startBalance: {
      main: round2(preMainBefore),
      gg: round2(preGgBefore),
      total: round2(preMainBefore + preGgBefore),
    },
    series,
  });
}

/* --------------------------- Date Helpers --------------------------- */

function parseDateUtc(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isFinite(d.getTime()) ? d : null;
}
function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function endOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}
function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}