import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/clubyears/:id/reopen
 * Setzt den Abschluss-Status zurück (nur solange noch nicht fixiert).
 * Body: { stage?: "CLOSED" | "AUDITED" }
 *  - stage = "AUDITED" → setzt nur den Prüfvermerk zurück (auditedAt → null)
 *  - sonst             → setzt zusätzlich isClosed/closedAt zurück (Schatzmeister kann frei buchen)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { stage?: "CLOSED" | "AUDITED" };
  const cy = await prisma.clubYear.findUnique({ where: { id } });
  if (!cy) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cy.lockedAt) {
    return NextResponse.json(
      { error: `Clubjahr ${cy.label} ist bereits fixiert und kann nicht wieder geöffnet werden.` },
      { status: 409 },
    );
  }
  const data: Record<string, unknown> = { auditedAt: null, auditedById: null, auditNotes: null };
  if (body.stage !== "AUDITED") {
    data.isClosed = false;
    data.closedAt = null;
    data.closedById = null;
  }
  const out = await prisma.clubYear.update({ where: { id }, data });
  return NextResponse.json({ id: out.id, isClosed: out.isClosed, auditedAt: out.auditedAt });
}