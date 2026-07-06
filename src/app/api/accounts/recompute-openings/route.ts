import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { recomputeOpeningBalances } from "@/lib/recomputeOpenings";

/**
 * POST /api/accounts/recompute-openings
 * Setzt die Eröffnungssaldo-Übernahme-Kette konsistent (opening N+1 =
 * closing N). Nur Schatzmeister/Admin. `dryRun: true` = nur Vorschau.
 * Fixierte Jahre bleiben unverändert.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;
  const result = await recomputeOpeningBalances({ dryRun });
  return NextResponse.json(result);
}