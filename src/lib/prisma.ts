import { PrismaClient } from "@prisma/client";

/**
 * Baut eine robuste Runtime-DB-URL für Serverless (Vercel + Neon).
 *
 * Neon betreibt den Pooler als PgBouncer im Transaction-Mode. Ohne
 * `pgbouncer=true` nutzt Prisma Prepared Statements, die dort zu Fehlern führen
 * ("Error in PostgreSQL connection: Closed"). `connect_timeout` gibt der
 * Verbindung mehr Zeit, bevor sie abbricht. Bestehende Query-Parameter bleiben
 * erhalten; an einer direkten (nicht-Pooler-)URL wird `pgbouncer` NICHT gesetzt.
 */
function buildRuntimeDbUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const isPooler =
      u.hostname.includes("pooler") || u.hostname.includes("pgbouncer");
    if (isPooler && !u.searchParams.has("pgbouncer")) {
      u.searchParams.set("pgbouncer", "true");
    }
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "15");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const runtimeDbUrl = buildRuntimeDbUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(runtimeDbUrl
      ? { datasources: { db: { url: runtimeDbUrl } } }
      : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
