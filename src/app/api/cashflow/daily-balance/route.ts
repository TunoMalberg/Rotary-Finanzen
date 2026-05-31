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
 * Berechnung — exakt analog zu `getAccountBalance(account, clubYearId)`:
 *  Für jeden Tag d wird das Clubjahr Y(d) bestimmt, das d enthält
 *  (oder das letzte vor d, falls d außerhalb aller Jahre liegt).
 *  Saldo(d) = Y(d).openingBalance + Σ Buchungen mit clubYearId == Y(d) UND date ≤ d
 *
 *  Dadurch werden manuell gesetzte Eröffnungssalden respektiert
 *  (sie können vom rechnerischen Endsaldo des Vorjahres abweichen
 *  → "Übernahme-Delta", siehe /accounts).
 *  An Clubjahresgrenzen entsteht ein Sprung in Höhe dieses Deltas.
 *
 * Liefert für jeden Tag drei Salden:
 *  - main: nur Hauptkonto
 *  - gg:   nur Global Grant
 *  - total: Summe (= „Gesamtvermögen")
 *
 * Wenn `to` fehlt → heute. Wenn `from` fehlt → erster Tag des frühesten
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

  // Alle Clubjahre, aufsteigend
  const years = await prisma.clubYear.findMany({
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      openingBalanceMain: true,
      openingBalanceGG: true,
    },
  });
  if (years.length === 0) {
    return NextResponse.json({ error: "Kein Clubjahr vorhanden." }, { status: 404 });
  }
  const earliest = years[0];
  const latest = years[years.length - 1];

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

  // Alle Buchungen (für beide Konten) bis einschl. `to`.
  // Wir benötigen pro clubYearId getrennte Aggregate.
  const txs = await prisma.transaction.findMany({
    where: {
      accountId: { in: [mainAcc.id, ggAcc.id] },
      deletedAt: null,
      date: { lte: endOfDayUtc(to) },
    },
    select: { date: true, amount: true, accountId: true, clubYearId: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  // Pro Jahr → pro Tag (yyyy-mm-dd) → {main, gg} Delta
  const byYearByDay = new Map<string, Map<string, { main: number; gg: number }>>();
  for (const t of txs) {
    let m = byYearByDay.get(t.clubYearId);
    if (!m) {
      m = new Map();
      byYearByDay.set(t.clubYearId, m);
    }
    const dayKey = isoDate(startOfDayUtc(t.date));
    const cur = m.get(dayKey) ?? { main: 0, gg: 0 };
    if (t.accountId === mainAcc.id) cur.main += t.amount;
    else cur.gg += t.amount;
    m.set(dayKey, cur);
  }

  /**
   * Liefert das Clubjahr, dem der Tag d zugeordnet wird:
   * 1) Y mit startsAt ≤ d ≤ endsAt
   * 2) sonst das letzte Y mit startsAt ≤ d
   * 3) sonst das früheste Y
   */
  function yearFor(d: Date) {
    const inRange = years.find((y) => y.startsAt <= d && d <= y.endsAt);
    if (inRange) return inRange;
    if (d < earliest.startsAt) return earliest;
    // d > latest.endsAt → letztes Jahr nehmen
    let candidate = earliest;
    for (const y of years) {
      if (y.startsAt <= d) candidate = y;
    }
    return candidate;
  }

  /**
   * Saldo für Tag d laut Clubjahres-Logik:
   *   Y(d).opening + Σ tx mit clubYearId == Y(d) UND date ≤ d
   * Wenn d < Y(d).startsAt: nur opening (Tx mit früherem Datum aber demselben
   * clubYearId fließen rückwirkend ins opening ein — wir zeigen dennoch
   * deterministisch das opening als Anfang).
   *
   * Damit das mit `getAccountBalance` für d ≥ Y.endsAt konsistent ist,
   * berücksichtigen wir bei d ≥ Y.endsAt ALLE Transaktionen des Jahres
   * (auch mit Datum > endsAt).
   */
  // Vorab: pro Jahr sortierte Tageskeys + kumulative Salden.
  type Cum = { day: string; main: number; gg: number };
  const yearCum = new Map<string, Cum[]>();
  for (const y of years) {
    const dayMap = byYearByDay.get(y.id);
    const days = dayMap ? Array.from(dayMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)) : [];
    let runMain = y.openingBalanceMain;
    let runGg = y.openingBalanceGG;
    const cum: Cum[] = [];
    for (const [dayKey, delta] of days) {
      runMain += delta.main;
      runGg += delta.gg;
      cum.push({ day: dayKey, main: runMain, gg: runGg });
    }
    yearCum.set(y.id, cum);
  }

  /** Findet kumulativen Saldo für Jahr y am Tag d (oder letzter Wert ≤ d). */
  function cumAt(yId: string, dKey: string): { main: number; gg: number } | null {
    const cum = yearCum.get(yId);
    if (!cum || cum.length === 0) return null;
    // Binary search: größter Index mit cum[i].day ≤ dKey
    let lo = 0;
    let hi = cum.length - 1;
    let pos = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid].day <= dKey) {
        pos = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (pos < 0) return null;
    return { main: cum[pos].main, gg: cum[pos].gg };
  }

  // Für jeden Tag: Saldo = Y(d).opening + cumAt(Y(d), d) − Y(d).opening
  // = cumAt-Wert (da cum bereits opening enthält). Wenn kein cum-Eintrag (kein
  // Tx vor d in Y(d)), → opening.
  const series: Array<{
    date: string;
    main: number;
    gg: number;
    total: number;
    delta: number;
  }> = [];

  let prevTotal: number | null = null;
  for (let d = new Date(from); d <= to; d = addDaysUtc(d, 1)) {
    const dKey = isoDate(d);
    const y = yearFor(d);
    const cum = cumAt(y.id, dKey);
    const main = cum ? cum.main : y.openingBalanceMain;
    const gg = cum ? cum.gg : y.openingBalanceGG;
    const total = main + gg;
    const delta = prevTotal == null ? 0 : total - prevTotal;
    series.push({
      date: dKey,
      main: round2(main),
      gg: round2(gg),
      total: round2(total),
      delta: round2(delta),
    });
    prevTotal = total;
  }

  // startBalance für KPIs: Saldo am ersten angezeigten Tag (vor dem Tagesdelta).
  // Wir zeigen den Saldo des Tages vor `from` (= "Stand zu Beginn").
  const dayBeforeFrom = addDaysUtc(from, -1);
  const yPrev = yearFor(dayBeforeFrom);
  const cumPrev = cumAt(yPrev.id, isoDate(dayBeforeFrom));
  const startMain = cumPrev ? cumPrev.main : yPrev.openingBalanceMain;
  const startGg = cumPrev ? cumPrev.gg : yPrev.openingBalanceGG;

  return NextResponse.json({
    from: isoDate(from),
    to: isoDate(to),
    startBalance: {
      main: round2(startMain),
      gg: round2(startGg),
      total: round2(startMain + startGg),
    },
    series,
    // Diagnostik (zur Plausibilitätsprüfung):
    meta: {
      yearsCount: years.length,
      earliest: isoDate(earliest.startsAt),
      latest: isoDate(latest.endsAt),
    },
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