import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import {
  clubYearBoundsForDate,
  ensureClubYearForDate,
} from "@/lib/clubYearLifecycle";

/**
 * POST /api/accounts/reassign-years
 *
 * Repariert die Clubjahr-Zuordnung bestehender Buchungen: jede (nicht
 * gelöschte) Buchung wird dem rotarischen Jahr (1.7.–30.6.) zugeordnet, in
 * das ihr Buchungsdatum fällt. Damit werden z. B. Juli-Buchungen, die noch
 * fälschlich im alten Jahr hingen, ins richtige neue Jahr verschoben.
 *
 * Sicherheit:
 *  - Nur Schatzmeister/Admin.
 *  - Buchungen, deren aktuelles ODER Ziel-Jahr FIXIERT (lockedAt) ist, werden
 *    NICHT angefasst (archivierte Jahre bleiben unverändert).
 *  - `dryRun: true` liefert nur eine Vorschau (nichts wird geschrieben).
 *
 * Antwort: { moved, skippedLocked, unchanged, byYear: [...] }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const [txs, years] = await Promise.all([
    prisma.transaction.findMany({
      where: { deletedAt: null },
      select: { id: true, date: true, clubYearId: true },
    }),
    prisma.clubYear.findMany({
      select: { id: true, label: true, lockedAt: true },
    }),
  ]);
  const yearById = new Map(years.map((y) => [y.id, y]));

  // Ziel-Jahr je Label auflösen (Cache). Bei echten Läufen legen wir fehlende
  // (Folge-)Jahre automatisch mit Saldo-Übernahme an.
  const targetByLabel = new Map<
    string,
    { id: string; label: string; lockedAt: Date | null } | null
  >();
  async function resolveTarget(date: Date) {
    const { label } = clubYearBoundsForDate(date);
    if (targetByLabel.has(label)) return targetByLabel.get(label)!;
    let entry: { id: string; label: string; lockedAt: Date | null } | null =
      years.find((y) => y.label === label) ?? null;
    if (!entry && !dryRun) {
      const created = await ensureClubYearForDate(date);
      entry = { id: created.id, label: created.label, lockedAt: created.lockedAt };
    }
    targetByLabel.set(label, entry);
    return entry;
  }

  let moved = 0;
  let skippedLocked = 0;
  let unchanged = 0;
  // Verschiebungen je "von-Label → zu-Label" zählen (für die Vorschau).
  const flows = new Map<string, number>();
  const toMove: Array<{ id: string; targetId: string }> = [];

  for (const t of txs) {
    const target = await resolveTarget(t.date);
    const fromYear = yearById.get(t.clubYearId) ?? null;
    const targetLabel = clubYearBoundsForDate(t.date).label;

    // Schon korrekt zugeordnet?
    if (target && target.id === t.clubYearId) {
      unchanged++;
      continue;
    }
    // Kein Ziel ermittelbar (nur im dryRun möglich, wenn Jahr noch fehlt):
    if (!target) {
      // Würde beim echten Lauf neu angelegt → als Bewegung zählen.
      const key = `${fromYear?.label ?? "?"} → ${targetLabel} (neu)`;
      flows.set(key, (flows.get(key) ?? 0) + 1);
      moved++;
      continue;
    }
    // Fixierte Jahre (Quelle oder Ziel) niemals anfassen.
    if (fromYear?.lockedAt || target.lockedAt) {
      skippedLocked++;
      continue;
    }
    const key = `${fromYear?.label ?? "?"} → ${target.label}`;
    flows.set(key, (flows.get(key) ?? 0) + 1);
    moved++;
    toMove.push({ id: t.id, targetId: target.id });
  }

  if (!dryRun && toMove.length > 0) {
    // In Batches je Zieljahr aktualisieren.
    const byTarget = new Map<string, string[]>();
    for (const m of toMove) {
      const arr = byTarget.get(m.targetId) ?? [];
      arr.push(m.id);
      byTarget.set(m.targetId, arr);
    }
    for (const [targetId, ids] of byTarget) {
      await prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: { clubYearId: targetId },
      });
    }
  }

  return NextResponse.json({
    dryRun,
    total: txs.length,
    moved,
    skippedLocked,
    unchanged,
    flows: [...flows.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  });
}