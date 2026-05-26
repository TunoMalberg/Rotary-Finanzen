import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { ensureAttendanceCategory } from "@/lib/attendanceHelpers";

/**
 * POST /api/attendance
 *
 * Legt eine neue Teilnahmeliste / Auslagenprojekt an. Erzeugt automatisch:
 *  - eine Auto-Kategorie (kind=EXPENSE, scoped auf das Clubjahr) für
 *    Buchungs-Zuordnung
 *  - Entries für alle ausgewählten Mitglieder (mit personCount)
 *  - optional neu angelegte Nichtmitglied-Datensätze (Member.status=NON_MEMBER)
 *    mit dazugehörigem Entry
 *
 * Body:
 * {
 *   clubYearId, eventName, eventDate, billPerHead, paymentMethod, description?,
 *   members: [{ memberId, personCount?, paymentOverride? }, ...],
 *   newNonMembers: [{ firstName, lastName, email?, iban?, paysBySEPA?,
 *                     phone?, personCount?, paymentOverride? }, ...]
 * }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ungültiger JSON-Body" }, { status: 400 });
  }
  const b = body as {
    clubYearId?: string;
    eventName?: string;
    eventDate?: string;
    description?: string | null;
    billPerHead?: number | string;
    paymentMethod?: string;
    members?: Array<{ memberId: string; personCount?: number; paymentOverride?: string | null }>;
    /** Backwards-Compat: ältere UI sendet nur memberIds. */
    memberIds?: string[];
    newNonMembers?: Array<{
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      iban?: string | null;
      paysBySEPA?: boolean;
      personCount?: number;
      paymentOverride?: string | null;
    }>;
  };

  if (!b.clubYearId || !b.eventName || !b.eventDate) {
    return NextResponse.json({ error: "clubYearId, eventName, eventDate erforderlich" }, { status: 400 });
  }

  const billPerHead = Number(typeof b.billPerHead === "string" ? b.billPerHead.replace(",", ".") : b.billPerHead);
  if (!Number.isFinite(billPerHead) || billPerHead <= 0) {
    return NextResponse.json({ error: "billPerHead > 0 erforderlich" }, { status: 400 });
  }

  const paymentMethod = b.paymentMethod ?? "MIXED";
  if (!["SEPA", "EMAIL_INVOICE", "MIXED"].includes(paymentMethod)) {
    return NextResponse.json({ error: "ungültige paymentMethod" }, { status: 400 });
  }

  const memberInputs: Array<{ memberId: string; personCount: number; paymentOverride: string | null }> = [];
  if (Array.isArray(b.members)) {
    for (const m of b.members) {
      const pc = Math.max(1, Math.floor(Number(m.personCount ?? 1)));
      memberInputs.push({ memberId: m.memberId, personCount: pc, paymentOverride: m.paymentOverride ?? null });
    }
  } else if (Array.isArray(b.memberIds)) {
    for (const id of b.memberIds) memberInputs.push({ memberId: id, personCount: 1, paymentOverride: null });
  }

  const newNonMembers = Array.isArray(b.newNonMembers) ? b.newNonMembers : [];
  for (const nm of newNonMembers) {
    if (!nm.firstName?.trim() || !nm.lastName?.trim()) {
      return NextResponse.json({ error: "Vor- und Nachname für Nichtmitglieder erforderlich" }, { status: 400 });
    }
  }

  if (memberInputs.length === 0 && newNonMembers.length === 0) {
    return NextResponse.json({ error: "Mindestens 1 Teilnehmer erforderlich" }, { status: 400 });
  }

  // 1. Liste anlegen (zunächst ohne Kategorie – wir verlinken sie unten).
  const list = await prisma.attendanceList.create({
    data: {
      eventName: b.eventName.trim(),
      eventDate: new Date(b.eventDate),
      description: b.description?.trim() || null,
      billPerHead,
      paymentMethod,
      clubYearId: b.clubYearId,
    },
  });

  // 2. Auto-Kategorie erzeugen + verlinken.
  const categoryId = await ensureAttendanceCategory({
    clubYearId: b.clubYearId,
    eventName: list.eventName,
    existingCategoryId: null,
  });
  await prisma.attendanceList.update({ where: { id: list.id }, data: { categoryId } });

  // 3. Member-Entries anlegen.
  for (const m of memberInputs) {
    const exists = await prisma.member.findUnique({ where: { id: m.memberId } });
    if (!exists) continue;
    const dup = await prisma.attendanceEntry.findFirst({ where: { listId: list.id, memberId: m.memberId } });
    if (dup) continue;
    await prisma.attendanceEntry.create({
      data: {
        listId: list.id,
        memberId: m.memberId,
        personCount: m.personCount,
        amount: round2(billPerHead * m.personCount),
        paymentOverride: m.paymentOverride,
      },
    });
  }

  // 4. Nichtmitglieder anlegen (status=NON_MEMBER) + Entry.
  for (const nm of newNonMembers) {
    const personCount = Math.max(1, Math.floor(Number(nm.personCount ?? 1)));
    // Duplicate-Check via firstName+lastName+email
    let memberRow = await prisma.member.findFirst({
      where: {
        firstName: nm.firstName.trim(),
        lastName: nm.lastName.trim(),
        email: nm.email?.trim() || null,
      },
    });
    if (!memberRow) {
      memberRow = await prisma.member.create({
        data: {
          firstName: nm.firstName.trim(),
          lastName: nm.lastName.trim(),
          email: nm.email?.trim() || null,
          phone: nm.phone?.trim() || null,
          iban: nm.iban?.trim() || null,
          paysBySEPA: !!nm.paysBySEPA,
          isExempt: true, // Nichtmitglieder haben keine Mitgliedsbeiträge.
          duesAmount: 0,
          status: "NON_MEMBER",
          notes: `Erstellt via Auslagenprojekt "${list.eventName}"`,
        },
      });
    }
    await prisma.attendanceEntry.create({
      data: {
        listId: list.id,
        memberId: memberRow.id,
        personCount,
        amount: round2(billPerHead * personCount),
        paymentOverride: nm.paymentOverride ?? null,
      },
    });
  }

  return NextResponse.json({ id: list.id, categoryId });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}