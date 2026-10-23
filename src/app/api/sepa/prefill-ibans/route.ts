import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeIban } from "@/lib/sepaExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Proposal = {
  memberId: string;
  name: string;
  currentIban: string;
  proposedIban: string;
};

/**
 * POST /api/sepa/prefill-ibans
 *
 * Ermittelt je Mitglied die zuletzt in einer SEPA-Buchungsaufteilung
 * (TxAllocation.partnerIban) gesehene IBAN und schlägt sie als Mitglieds-IBAN
 * vor. Nur Vorschläge, bei denen eine IBAN existiert und sich von der aktuell
 * hinterlegten IBAN unterscheidet, werden geliefert.
 *
 * Body:
 *   - apply?: boolean  → wenn true, werden die Vorschläge übernommen, aber NUR
 *     dort, wo `member.iban` aktuell leer ist (bestehende IBANs bleiben
 *     unangetastet).
 *   - sepaOnly?: boolean → nur Mitglieder mit paysBySEPA (Default: true).
 *
 * Rückgabe: { proposals, appliedCount }.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    apply?: boolean;
    sepaOnly?: boolean;
  };
  const apply = body.apply === true;
  const sepaOnly = body.sepaOnly !== false; // Default: nur SEPA-Zahler

  const members = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      ...(sepaOnly ? { paysBySEPA: true } : {}),
    },
    select: { id: true, firstName: true, lastName: true, iban: true },
  });

  const proposals: Proposal[] = [];

  for (const m of members) {
    // Neueste TxAllocation mit partnerIban für dieses Mitglied.
    const alloc = await prisma.txAllocation.findFirst({
      where: { memberId: m.id, partnerIban: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { partnerIban: true },
    });
    const proposedIban = normalizeIban(alloc?.partnerIban);
    if (!proposedIban) continue;

    const currentIban = normalizeIban(m.iban);
    if (proposedIban === currentIban) continue;

    proposals.push({
      memberId: m.id,
      name: `${m.lastName}, ${m.firstName}`,
      currentIban,
      proposedIban,
    });
  }

  let appliedCount = 0;
  if (apply) {
    for (const p of proposals) {
      // Nur setzen, wenn aktuell leer – bestehende IBANs NICHT überschreiben.
      const res = await prisma.member.updateMany({
        where: {
          id: p.memberId,
          OR: [{ iban: null }, { iban: "" }],
        },
        data: { iban: p.proposedIban },
      });
      appliedCount += res.count;
    }
  }

  return NextResponse.json({ proposals, appliedCount });
}
