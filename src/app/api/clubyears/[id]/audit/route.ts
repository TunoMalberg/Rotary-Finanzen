import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/clubyears/:id/audit
 * Body: { notes?: string, undo?: boolean }
 * Markiert ein Clubjahr als von den Rechnungsprüfern geprüft.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { notes?: string; undo?: boolean };
  const cy = await prisma.clubYear.findUnique({ where: { id } });
  if (!cy) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cy.lockedAt) {
    return NextResponse.json(
      { error: `Clubjahr ${cy.label} ist bereits fixiert – Prüfvermerk nicht änderbar.` },
      { status: 409 },
    );
  }
  if (body.undo) {
    const out = await prisma.clubYear.update({
      where: { id },
      data: { auditedAt: null, auditedById: null, auditNotes: null },
    });
    return NextResponse.json({ id: out.id, auditedAt: out.auditedAt });
  }
  if (!cy.isClosed) {
    return NextResponse.json(
      { error: "Clubjahr ist noch nicht abgeschlossen. Bitte zuerst abschließen." },
      { status: 409 },
    );
  }
  const updated = await prisma.clubYear.update({
    where: { id },
    data: {
      auditedAt: new Date(),
      auditedById: session?.user?.id,
      auditNotes: body.notes ?? null,
    },
  });
  return NextResponse.json({ id: updated.id, auditedAt: updated.auditedAt });
}