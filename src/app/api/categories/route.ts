import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

/**
 * GET /api/categories?clubYearId=<id>
 * Liefert alle Kategorien (globale + optional die des Clubjahrs).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clubYearId = url.searchParams.get("clubYearId");
  const where = clubYearId
    ? { OR: [{ clubYearId: null }, { clubYearId }] }
    : {};
  const items = await prisma.category.findMany({
    where,
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      clubYear: { select: { id: true, label: true } },
      _count: { select: { transactions: true } },
    },
  });
  return NextResponse.json(items);
}

/**
 * POST /api/categories
 * Body: { name, kind, color?, clubYearId?, sortOrder? }
 * Wenn clubYearId gesetzt → year-spezifische Kategorie (z. B. für Projekt).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const kind = String(body.kind ?? "").toUpperCase();
  if (!name) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  if (!["INCOME", "EXPENSE", "NEUTRAL"].includes(kind)) {
    return NextResponse.json(
      { error: "kind muss INCOME, EXPENSE oder NEUTRAL sein" },
      { status: 400 },
    );
  }
  const color =
    typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)
      ? body.color
      : "#17458F";
  const clubYearId = body.clubYearId ? String(body.clubYearId) : null;
  const sortOrder = Number.isFinite(body.sortOrder)
    ? Number(body.sortOrder)
    : 100;

  // Doppel-Check: Name innerhalb scope (NULL or year)
  const existing = await prisma.category.findFirst({
    where: { name, clubYearId },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `Kategorie "${name}" existiert bereits${clubYearId ? " für dieses Clubjahr" : " (global)"}.`,
      },
      { status: 409 },
    );
  }

  const created = await prisma.category.create({
    data: { name, kind, color, clubYearId, sortOrder },
  });
  return NextResponse.json(created);
}
