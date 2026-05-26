import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/**
 * POST /api/attendance/[id]/entries
 *
 * Fügt einen Teilnehmer zu einer existierenden Auslagenliste hinzu.
 * Body wahlweise:
 *   { memberId, personCount?, paymentOverride? }
 *  oder
 *   { newNonMember: { firstName, lastName, email?, phone?, iban?,
 *                     paysBySEPA?, personCount?, paymentOverride? } }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const list = await prisma.attendanceList.findUnique({ where: { id }, include: { clubYear: true } });
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (list.clubYear.lockedAt) {
    return NextResponse.json({ error: "Clubjahr fixiert" }, { status: 409 });
  }

  let body: {
    memberId?: string;
    personCount?: number;
    paymentOverride?: string | null;
    newNonMember?: {
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      iban?: string | null;
      paysBySEPA?: boolean;
      personCount?: number;
      paymentOverride?: string | null;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ungültiger JSON-Body" }, { status: 400 });
  }

  let memberId = body.memberId;
  let personCount = Math.max(1, Math.floor(Number(body.personCount ?? body.newNonMember?.personCount ?? 1)));
  const paymentOverride = body.paymentOverride ?? body.newNonMember?.paymentOverride ?? null;

  if (!memberId && body.newNonMember) {
    const nm = body.newNonMember;
    if (!nm.firstName?.trim() || !nm.lastName?.trim()) {
      return NextResponse.json({ error: "Vor- und Nachname für Nichtmitglieder erforderlich" }, { status: 400 });
    }
    let m = await prisma.member.findFirst({
      where: {
        firstName: nm.firstName.trim(),
        lastName: nm.lastName.trim(),
        email: nm.email?.trim() || null,
      },
    });
    if (!m) {
      m = await prisma.member.create({
        data: {
          firstName: nm.firstName.trim(),
          lastName: nm.lastName.trim(),
          email: nm.email?.trim() || null,
          phone: nm.phone?.trim() || null,
          iban: nm.iban?.trim() || null,
          paysBySEPA: !!nm.paysBySEPA,
          isExempt: true,
          duesAmount: 0,
          status: "NON_MEMBER",
          notes: `Erstellt via Auslagenprojekt "${list.eventName}"`,
        },
      });
    }
    memberId = m.id;
  }

  if (!memberId) {
    return NextResponse.json({ error: "memberId oder newNonMember erforderlich" }, { status: 400 });
  }
  if (!Number.isFinite(personCount) || personCount < 1) {
    return NextResponse.json({ error: "personCount >= 1 erforderlich" }, { status: 400 });
  }

  const dup = await prisma.attendanceEntry.findFirst({ where: { listId: id, memberId } });
  if (dup) return NextResponse.json({ error: "Teilnehmer bereits in Liste" }, { status: 409 });

  const entry = await prisma.attendanceEntry.create({
    data: {
      listId: id,
      memberId,
      personCount,
      amount: round2(list.billPerHead * personCount),
      paymentOverride,
    },
  });
  return NextResponse.json({ id: entry.id });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}