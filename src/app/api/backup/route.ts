import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Vollständiger DB-Dump kann bei viel Buchungs-Volumen etwas dauern.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/backup
 *
 * Liefert ein vollständiges Backup der Datenbank als JSON-Datei zum lokalen
 * Speichern. Enthält alle Tabellen (dynamisch über das Prisma-Datenmodell,
 * damit künftige Tabellen automatisch mitgesichert werden).
 *
 * Auth: Schatzmeister/Admin/Auditor (isTreasurer).
 *
 * Hinweis: Das Backup enthält alle Daten inkl. Passwort-Hashes und ist daher
 * vertraulich zu behandeln. Es dient als vollständige Sicherung ("kein
 * Datenverlust") und als Grundlage für eine spätere Wiederherstellung.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Alle Modelle aus dem Prisma-Datenmodell ableiten (camelCase Client-Prop).
  const models = Prisma.dmmf.datamodel.models;
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  try {
    for (const model of models) {
      const prop = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      const delegate = (prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[prop];
      if (!delegate?.findMany) continue;
      const rows = await delegate.findMany();
      tables[model.name] = rows;
      counts[model.name] = rows.length;
    }
  } catch (e) {
    console.error("[backup] export failed:", e);
    const msg = e instanceof Error ? e.message : "Backup konnte nicht erstellt werden.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const generatedAt = new Date();
  const backup = {
    meta: {
      app: "rotary-finanzen",
      format: "full-json",
      version: 1,
      generatedAt: generatedAt.toISOString(),
      generatedBy: session?.user?.email ?? session?.user?.name ?? null,
      appCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      counts,
    },
    tables,
  };

  // BigInt-sicher serialisieren (Prisma Decimal/Date bringen eigenes toJSON mit).
  const json = JSON.stringify(
    backup,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

  const dateStr = generatedAt.toISOString().slice(0, 10);
  const filename = `rotary-finanzen-backup_${dateStr}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
