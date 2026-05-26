import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { parseSepaPdf, type SepaEntry } from "@/lib/sepaPdfParse";

// Vercel: bei großen Sammeleinzügen (z. B. 67 Aufträge) braucht das Schreiben
// in Neon mehr Zeit als der Hobby-Default (10 s). Pro-Plan erlaubt bis 60 s.
export const maxDuration = 60;

/**
 * POST /api/import/sepa
 *
 * Verarbeitet eine SEPA-Sammeleinzug-PDF (George/Erste Bank) und teilt eine
 * aggregierte Bank-Buchung in einzelne Mitglieds-Anteile auf. Offene
 * Forderungen (z. B. Mitgliedsbeiträge) werden dabei automatisch als bezahlt
 * markiert.
 *
 * Felder (multipart/form-data):
 *   - file:          PDF-Datei (Pflicht)
 *   - accountId:     Ziel-Konto (Pflicht)
 *   - transactionId: optional – wenn nicht gesetzt, wird die passende
 *                    aggregierte Buchung anhand Lastschriftsumme + Sammlung-
 *                    Referenz automatisch ermittelt.
 *   - dryRun:        "true" → keine DB-Schreibvorgänge
 *   - settleInvoices: "true" → Forderungen direkt auf PAID setzen.
 *     Default ist "false": Aufteilungen werden gespeichert, aber Forderungen
 *     bleiben offen, bis sie über "Einzüge vornehmen" auf der Buchungs-
 *     Detailseite manuell ausgeglichen werden.
 *
 * Logik:
 *   1. PDF parsen → Header + Einzeleinträge.
 *   2. Aggregat-Buchung finden (Konto + Betrag = Lastschriftsumme + ggf. Ref).
 *   3. Pro Eintrag Member matchen (lastName, IBAN-Fallback).
 *   4. Pro Eintrag offene Invoice (DUES, OPEN/REMINDED, gleicher Betrag,
 *      Clubjahr der Aggregat-Buchung) suchen.
 *   5. TxAllocation pro Eintrag anlegen.
 *   6. Optional (settleInvoices=true): Invoice auf PAID setzen
 *      (paidTransactionId = aggregateTx.id).
 *   7. Aggregat-Buchung erhält Kategorie "Mitgliedsbeitrag" und memberId=null
 *      (die Member-Bezüge laufen jetzt über Allocations).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  const accountId = String(fd.get("accountId") ?? "");
  const txIdProvided = String(fd.get("transactionId") ?? "");
  const dryRun = String(fd.get("dryRun") ?? "") === "true";
  const settleInvoices = String(fd.get("settleInvoices") ?? "") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!accountId) {
    return NextResponse.json({ error: "accountId fehlt" }, { status: 400 });
  }
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Bitte SEPA-Sammeleinzug als PDF hochladen." },
      { status: 400 },
    );
  }

  // 1. PDF parsen
  let parsed;
  try {
    parsed = await parseSepaPdf(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF konnte nicht gelesen werden." },
      { status: 400 },
    );
  }
  if (parsed.entries.length === 0) {
    return NextResponse.json(
      { error: "Keine Einträge im PDF gefunden.", parsed },
      { status: 400 },
    );
  }

  const entrySum = round2(parsed.entries.reduce((a, e) => a + e.amount, 0));
  const headerTotal = parsed.totalAmount ? round2(parsed.totalAmount) : null;

  // 2. Aggregat-Buchung finden
  let aggregateTx = null as
    | (Awaited<ReturnType<typeof prisma.transaction.findFirst>> & { id: string })
    | null;
  if (txIdProvided) {
    aggregateTx = await prisma.transaction.findFirst({
      where: { id: txIdProvided, accountId, deletedAt: null },
    });
    if (!aggregateTx) {
      return NextResponse.json(
        { error: "Angegebene Buchung nicht gefunden." },
        { status: 404 },
      );
    }
  } else {
    // Heuristik: Betrag = Lastschriftsumme (Income, also positiv); zusätzlich
    // bevorzugen wir Buchungen mit Sammlung-Referenz im Verwendungszweck.
    const target = headerTotal ?? entrySum;
    const candidates = await prisma.transaction.findMany({
      where: {
        accountId,
        amount: target,
        deletedAt: null,
      },
      orderBy: { date: "desc" },
      take: 10,
    });
    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            `Keine Bank-Buchung mit Betrag ${target.toFixed(2)} EUR auf diesem Konto gefunden. ` +
            "Bitte Bank-Datei zuerst importieren oder Buchung manuell auswählen.",
          parsed,
        },
        { status: 404 },
      );
    }
    if (parsed.collectionRef) {
      const ref = parsed.collectionRef.toLowerCase();
      const refHit = candidates.find((c) =>
        (c.purpose || "").toLowerCase().includes(ref),
      );
      aggregateTx = refHit ?? candidates[0];
    } else {
      aggregateTx = candidates[0];
    }
  }

  if (!aggregateTx) {
    return NextResponse.json({ error: "Aggregat-Buchung nicht ermittelt." }, { status: 404 });
  }

  // Konsistenz-Prüfungen
  const txAmount = round2(aggregateTx.amount);
  const sumCheck = round2(entrySum) === Math.abs(txAmount) ||
    (headerTotal != null && round2(headerTotal) === Math.abs(txAmount));
  if (!sumCheck) {
    return NextResponse.json(
      {
        error:
          `Summen-Mismatch: PDF-Summe ${entrySum.toFixed(2)} EUR (Header: ${headerTotal ?? "—"}) passt nicht zu Buchungsbetrag ${txAmount.toFixed(2)} EUR.`,
        parsed,
      },
      { status: 400 },
    );
  }

  // Bereits Allocations vorhanden?
  const existingAllocs = await prisma.txAllocation.count({
    where: { transactionId: aggregateTx.id },
  });
  if (existingAllocs > 0 && !dryRun) {
    return NextResponse.json(
      {
        error: `Diese Buchung wurde bereits aufgeteilt (${existingAllocs} Aufteilungen vorhanden). Vorher Allocations löschen, falls neu aufgeteilt werden soll.`,
        parsed,
        aggregateTransactionId: aggregateTx.id,
      },
      { status: 409 },
    );
  }

  // 3-4. Member + Invoice matchen
  const members = await prisma.member.findMany({
    select: {
      id: true,
      lastName: true,
      firstName: true,
      iban: true,
    },
  });
  // Schneller Lookup nach lower(lastName) + IBAN
  const memberByLastname = new Map<string, typeof members>();
  for (const m of members) {
    const k = m.lastName.toLowerCase();
    const arr = memberByLastname.get(k) ?? [];
    arr.push(m);
    memberByLastname.set(k, arr);
  }
  const memberByIban = new Map<string, typeof members[number]>();
  for (const m of members) {
    if (m.iban) memberByIban.set(m.iban.replace(/\s+/g, "").toUpperCase(), m);
  }

  type ResultEntry = {
    partnerName: string;
    lastName: string;
    amount: number;
    partnerIban: string | null;
    info: string | null;
    member: { id: string; name: string } | null;
    invoice: {
      id: string;
      reference: string;
      status: string;
      amount: number;
    } | null;
    matchType: "iban" | "name" | "name-ambiguous" | "none";
    note: string | null;
  };

  const result: ResultEntry[] = [];
  let memberMatched = 0;
  let invoiceMatched = 0;
  let unmatchedMembers = 0;
  let unmatchedInvoices = 0;

  for (const e of parsed.entries) {
    let matchedMember: (typeof members)[number] | null = null;
    let matchType: ResultEntry["matchType"] = "none";
    let note: string | null = null;

    // 1. IBAN
    if (e.partnerIban) {
      const iban = e.partnerIban.replace(/\s+/g, "").toUpperCase();
      const m = memberByIban.get(iban);
      if (m) {
        matchedMember = m;
        matchType = "iban";
      }
    }
    // 2. Lastname (erstes Token)
    if (!matchedMember) {
      const cands = memberByLastname.get(e.lastName.toLowerCase()) ?? [];
      if (cands.length === 1) {
        matchedMember = cands[0];
        matchType = "name";
      } else if (cands.length > 1) {
        // Versuche per Vorname zu disambiguieren (im partnerName enthalten)
        const lower = e.partnerName.toLowerCase();
        const fnHit = cands.find(
          (c) => c.firstName && lower.includes(c.firstName.toLowerCase()),
        );
        if (fnHit) {
          matchedMember = fnHit;
          matchType = "name";
        } else {
          matchedMember = cands[0];
          matchType = "name-ambiguous";
          note = `mehrere Mitglieder mit Nachname "${e.lastName}" – erstes ausgewählt`;
        }
      }
    }
    if (matchedMember) memberMatched++;
    else unmatchedMembers++;

    // 5. Invoice match
    let matchedInvoice: {
      id: string;
      reference: string;
      status: string;
      amount: number;
    } | null = null;
    if (matchedMember) {
      // Match akzeptiert sowohl DUES (Mitgliedsbeiträge) als auch EXPENSE
      // (Auslagen-Forderungen) – ein Sammeleinzug kann beides enthalten.
      // Bevorzugt wird DUES, dann EXPENSE.
      let inv = await prisma.invoice.findFirst({
        where: {
          memberId: matchedMember.id,
          clubYearId: aggregateTx.clubYearId,
          type: "DUES",
          status: { in: ["OPEN", "REMINDED"] },
          amount: e.amount,
        },
        select: { id: true, reference: true, status: true, amount: true },
      });
      if (!inv) {
        inv = await prisma.invoice.findFirst({
          where: {
            memberId: matchedMember.id,
            clubYearId: aggregateTx.clubYearId,
            type: "EXPENSE",
            status: { in: ["OPEN", "REMINDED"] },
            amount: e.amount,
          },
          select: { id: true, reference: true, status: true, amount: true },
        });
      }
      if (inv) {
        matchedInvoice = inv;
        invoiceMatched++;
      } else {
        unmatchedInvoices++;
      }
    }

    result.push({
      partnerName: e.partnerName,
      lastName: e.lastName,
      amount: e.amount,
      partnerIban: e.partnerIban,
      info: e.info,
      member: matchedMember
        ? {
            id: matchedMember.id,
            name: `${matchedMember.firstName} ${matchedMember.lastName}`.trim(),
          }
        : null,
      invoice: matchedInvoice,
      matchType,
      note,
    });
  }

  // ----- DRY RUN: nur Vorschau zurückgeben -----
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      parsed: {
        collectionName: parsed.collectionName,
        collectionRef: parsed.collectionRef,
        expectedCount: parsed.expectedCount,
        totalAmount: parsed.totalAmount,
        executionDate: parsed.executionDate,
        dueDate: parsed.dueDate,
      },
      aggregateTransaction: {
        id: aggregateTx.id,
        date: aggregateTx.date,
        amount: aggregateTx.amount,
        purpose: aggregateTx.purpose,
        clubYearId: aggregateTx.clubYearId,
      },
      stats: {
        totalEntries: parsed.entries.length,
        memberMatched,
        unmatchedMembers,
        invoiceMatched,
        unmatchedInvoices,
        sum: entrySum,
      },
      preview: result,
    });
  }

  // ----- REAL: Allocations + Invoice-PAID -----
  // Wichtig: bei 60+ Einträgen würden 60+ einzelne `create()`-Calls die
  // Default-Transaction-Timeout (5 s) sprengen. Wir bauen das Daten-Array
  // einmal und nutzen `createMany` (1 Roundtrip).
  const allocationsData = parsed.entries.map((e: SepaEntry, i: number) => ({
    transactionId: aggregateTx!.id,
    memberId: result[i].member?.id ?? null,
    invoiceId: result[i].invoice?.id ?? null,
    amount: e.amount,
    description: e.info,
    partnerName: e.partnerName,
    partnerIban: e.partnerIban,
    source: "SEPA_PDF" as const,
  }));
  const invoiceIdsToSettle: string[] = settleInvoices
    ? result.filter((r) => r.invoice).map((r) => r.invoice!.id)
    : [];
  const cat = await prisma.category.findFirst({
    where: { name: "Mitgliedsbeitrag" },
    select: { id: true },
  });

  await prisma.$transaction(
    async (tx) => {
      // 1 Roundtrip für alle Aufteilungen
      await tx.txAllocation.createMany({ data: allocationsData });
      // 1 Roundtrip für alle ggf. zu begleichenden Forderungen
      if (invoiceIdsToSettle.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: invoiceIdsToSettle } },
          data: {
            status: "PAID",
            paidAt: aggregateTx!.date,
            paidTransactionId: aggregateTx!.id,
          },
        });
      }
      // Aggregat-Buchung markieren: Kategorie "Mitgliedsbeitrag" wenn passend +
      // memberId leeren (Bezüge laufen jetzt über Allocations).
      await tx.transaction.update({
        where: { id: aggregateTx!.id },
        data: {
          categoryId: cat?.id ?? aggregateTx!.categoryId,
          memberId: null,
          isReconciled: true,
        },
      });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return NextResponse.json({
    dryRun: false,
    settledInvoices: settleInvoices,
    parsed: {
      collectionName: parsed.collectionName,
      collectionRef: parsed.collectionRef,
      expectedCount: parsed.expectedCount,
      totalAmount: parsed.totalAmount,
    },
    aggregateTransaction: {
      id: aggregateTx.id,
      date: aggregateTx.date,
      amount: aggregateTx.amount,
      purpose: aggregateTx.purpose,
    },
    stats: {
      totalEntries: parsed.entries.length,
      memberMatched,
      unmatchedMembers,
      invoiceMatched,
      unmatchedInvoices,
      sum: entrySum,
    },
    preview: result,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}