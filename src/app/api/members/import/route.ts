import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { parseMemberRoster, statusFromSection } from "@/lib/memberRosterParse";

export const maxDuration = 60;

/**
 * POST /api/members/import
 *
 * Akzeptiert zwei Excel-Formate:
 *   1) **ClubRoster.xlsx** (neues Rotary-Export-Format, Sheet
 *      "Mitgliederverzeichnis") – aktuelle Quelle für Adress-Stammdaten.
 *   2) Altes EAR-Sheet "MB" (Member ID …) – Backwards-Compat.
 *
 * Verhalten:
 *   - Existierende Mitglieder werden anhand `rotaryMemberId` gematcht und
 *     **nur in den Stammdatenfeldern** (Name, Adresse, Telefon, E-Mail,
 *     joinedAt) aktualisiert. SEPA- und Befreiungs-Flags werden NICHT
 *     überschrieben (außer das alte MB-Format liefert sie explizit).
 *   - Neue Mitglieder werden mit Default-Werten angelegt:
 *       paysBySEPA=false, isExempt = (section==="Ehrenmitglieder"),
 *       duesAmount = isExempt ? 0 : 580, status entsprechend Sektion.
 *   - Mitglieder, die in der Datei NICHT mehr enthalten sind, werden auf
 *     status="INACTIVE" + leftAt=now gesetzt (sanftes Soft-Off-Boarding,
 *     keine harte Löschung – wegen FK-Bindung an alte Buchungen/Forderungen).
 *     Das passiert nur, wenn explizit `?deactivateMissing=1` gesetzt ist.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const deactivateMissing = url.searchParams.get("deactivateMissing") === "1";
  const dryRun = url.searchParams.get("dryRun") === "1";

  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());

  const parsed = parseMemberRoster(buf);
  if (parsed.format === "unknown" || parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "Format nicht erkannt. Bitte ClubRoster (Sheet 'Mitgliederverzeichnis') oder altes 'MB'-Sheet hochladen.",
        format: parsed.format,
        sheetName: parsed.sheetName,
      },
      { status: 400 },
    );
  }

  const seenIds = new Set<number>();
  const seenLocalIds = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const issues: { row: string; reason: string }[] = [];

  for (const row of parsed.rows) {
    if (!row.lastName) {
      issues.push({ row: row.firstName ?? "(?)", reason: "kein Nachname" });
      skipped++;
      continue;
    }

    const sectionStatus = statusFromSection(row.section);
    const isExemptDefault = sectionStatus === "EXEMPT";

    // Stammdaten-Felder, die immer übernommen werden:
    const stamm = {
      lastName: row.lastName,
      firstName: row.firstName,
      address: row.address,
      city: row.city,
      postalCode: row.postalCode,
      country: row.country,
      phone: row.phone,
      ...(row.email ? { email: row.email } : {}),
      ...(row.joinedAt ? { joinedAt: row.joinedAt } : {}),
      status: sectionStatus,
    };

    // Felder, die nur das alte MB-Format kennt und beim Update nur überschrieben
    // werden, wenn das Roster sie explizit liefert (sonst: nicht anfassen).
    const flagsForUpdate: Record<string, unknown> = {};
    if (row.paysBySEPA !== null) flagsForUpdate.paysBySEPA = row.paysBySEPA;
    if (row.isExempt !== null) {
      flagsForUpdate.isExempt = row.isExempt;
      flagsForUpdate.duesAmount = row.isExempt ? 0 : 580;
    }
    if (row.notes) flagsForUpdate.notes = row.notes;

    const updateData = { ...stamm, ...flagsForUpdate };

    // Felder für CREATE (komplett, inkl. defaults):
    const createData = {
      ...stamm,
      paysBySEPA: row.paysBySEPA ?? false,
      isExempt: row.isExempt ?? isExemptDefault,
      duesAmount: (row.isExempt ?? isExemptDefault) ? 0 : 580,
      ...(row.notes ? { notes: row.notes } : {}),
    };

    if (row.rotaryMemberId != null) {
      seenIds.add(row.rotaryMemberId);
      const existing = await prisma.member.findUnique({
        where: { rotaryMemberId: row.rotaryMemberId },
        select: { id: true },
      });
      if (existing) {
        if (!dryRun) {
          await prisma.member.update({
            where: { rotaryMemberId: row.rotaryMemberId },
            data: updateData,
          });
        }
        seenLocalIds.add(existing.id);
        updated++;
      } else {
        if (!dryRun) {
          const m = await prisma.member.create({
            data: { rotaryMemberId: row.rotaryMemberId, ...createData },
          });
          seenLocalIds.add(m.id);
        }
        created++;
      }
    } else {
      // Kein Rotary-ID → match nach Name
      const existing = await prisma.member.findFirst({
        where: { lastName: row.lastName, firstName: row.firstName },
        select: { id: true },
      });
      if (existing) {
        if (!dryRun) {
          await prisma.member.update({ where: { id: existing.id }, data: updateData });
        }
        seenLocalIds.add(existing.id);
        updated++;
      } else {
        if (!dryRun) {
          const m = await prisma.member.create({ data: createData });
          seenLocalIds.add(m.id);
        }
        created++;
      }
    }
  }

  // Optional: Mitglieder soft-deaktivieren, die nicht mehr in der Datei sind.
  let deactivated = 0;
  if (deactivateMissing && !dryRun) {
    const all = await prisma.member.findMany({
      select: { id: true, rotaryMemberId: true, status: true },
    });
    const toDeactivate = all
      .filter((m) => m.status !== "INACTIVE")
      .filter(
        (m) =>
          !seenLocalIds.has(m.id) &&
          (m.rotaryMemberId == null || !seenIds.has(m.rotaryMemberId)),
      )
      .map((m) => m.id);
    if (toDeactivate.length > 0) {
      const res = await prisma.member.updateMany({
        where: { id: { in: toDeactivate } },
        data: { status: "INACTIVE", leftAt: new Date() },
      });
      deactivated = res.count;
    }
  }

  return NextResponse.json({
    format: parsed.format,
    sheetName: parsed.sheetName,
    totalRows: parsed.rows.length,
    created,
    updated,
    skipped,
    deactivated,
    issues: issues.slice(0, 50),
    dryRun,
  });
}