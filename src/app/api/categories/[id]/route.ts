import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

/**
 * PATCH /api/categories/[id]
 * Update name / color / sortOrder / kind.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | number> = {};
  if (typeof body.name === "string" && body.name.trim())
    data.name = body.name.trim();
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color))
    data.color = body.color;
  if (Number.isFinite(body.sortOrder)) data.sortOrder = Number(body.sortOrder);
  if (
    typeof body.kind === "string" &&
    ["INCOME", "EXPENSE", "NEUTRAL"].includes(body.kind.toUpperCase())
  ) {
    data.kind = body.kind.toUpperCase();
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nichts zu aktualisieren" },
      { status: 400 },
    );
  }
  try {
    const updated = await prisma.category.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update fehlgeschlagen" },
      { status: 400 },
    );
  }
}

/**
 * DELETE /api/categories/[id]
 * Verhindert Löschen, wenn noch Buchungen oder Budget-Linien zugeordnet sind.
 * Globale Kategorien (clubYearId=NULL) werden zusätzlich vor versehentlichem
 * Löschen geschützt – nur Treasurer + force=1 erlaubt.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const cat = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { transactions: true, budgetLines: true } },
    },
  });
  if (!cat)
    return NextResponse.json(
      { error: "Kategorie nicht gefunden" },
      { status: 404 },
    );

  if (cat._count.transactions > 0 || cat._count.budgetLines > 0) {
    return NextResponse.json(
      {
        error: `Kategorie wird noch verwendet (${cat._count.transactions} Buchung(en), ${cat._count.budgetLines} Budgetzeile(n)). Bitte zuerst die Buchungen einer anderen Kategorie zuordnen.`,
        usage: cat._count,
      },
      { status: 409 },
    );
  }

  if (cat.clubYearId === null && !force) {
    return NextResponse.json(
      { error: "Globale Kategorie. Lösche mit ?force=1 explizit." },
      { status: 409 },
    );
  }

  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
