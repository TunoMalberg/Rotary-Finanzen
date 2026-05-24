import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * PATCH /api/clubyears/:id/opening
 * Body: { accountType: "MAIN" | "GLOBAL_GRANT_TRUST", value: number }
 *
 * Setzt den Eröffnungssaldo eines Clubjahres. Nur Schatzmeister/Admin.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const accountType = body.accountType as string;
  const value = Number(body.value);
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: "value muss eine Zahl sein" }, { status: 400 });
  }
  if (accountType !== "MAIN" && accountType !== "GLOBAL_GRANT_TRUST") {
    return NextResponse.json({ error: "ungültiger accountType" }, { status: 400 });
  }
  const data =
    accountType === "MAIN"
      ? { openingBalanceMain: value }
      : { openingBalanceGG: value };
  const cy = await prisma.clubYear.update({ where: { id }, data });
  return NextResponse.json({
    id: cy.id,
    label: cy.label,
    openingBalanceMain: cy.openingBalanceMain,
    openingBalanceGG: cy.openingBalanceGG,
  });
}