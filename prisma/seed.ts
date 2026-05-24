import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { CATEGORY_SEED, autoCategoryName } from "../src/lib/categorize";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Seed start");

  // --- Users ---
  const treasurerHash = await bcrypt.hash("Treasurer!2025", 10);
  const presidentHash = await bcrypt.hash("President!2025", 10);
  await prisma.user.upsert({
    where: { email: "treasurer@wien-donau.at" },
    update: {},
    create: {
      email: "treasurer@wien-donau.at",
      name: "C. Veyder-Malberg (Schatzmeister)",
      role: "treasurer",
      passwordHash: treasurerHash,
    },
  });
  await prisma.user.upsert({
    where: { email: "praesident@wien-donau.at" },
    update: {},
    create: {
      email: "praesident@wien-donau.at",
      name: "Präsident",
      role: "president",
      passwordHash: presidentHash,
    },
  });

  // --- Categories ---
  for (const c of CATEGORY_SEED) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {
        kind: c.kind,
        color: c.color,
        isDuesCategory: c.isDuesCategory ?? false,
        sortOrder: c.sortOrder,
      },
      create: {
        name: c.name,
        kind: c.kind,
        color: c.color,
        isDuesCategory: c.isDuesCategory ?? false,
        sortOrder: c.sortOrder,
      },
    });
  }

  // --- Accounts ---
  const main = await prisma.account.upsert({
    where: { id: "acc-main" },
    update: {},
    create: {
      id: "acc-main",
      name: "Erste Bank Hauptkonto",
      iban: "AT41 2011 1310 0670 0296",
      type: "MAIN",
    },
  });
  const gg = await prisma.account.upsert({
    where: { id: "acc-gg" },
    update: {},
    create: {
      id: "acc-gg",
      name: "Erste Bank Global Grant Treuhand",
      iban: "AT76 2011 1844 1109 9400",
      type: "GLOBAL_GRANT_TRUST",
    },
  });

  // --- ClubYears 2024/2025 and 2025/2026 ---
  const cy2425 = await prisma.clubYear.upsert({
    where: { label: "2024/2025" },
    update: {},
    create: {
      label: "2024/2025",
      startsAt: new Date(Date.UTC(2024, 6, 1)), // 1.7.2024
      endsAt: new Date(Date.UTC(2025, 5, 30, 23, 59, 59)), // 30.6.2025
      isClosed: true,
    },
  });
  const cy2526 = await prisma.clubYear.upsert({
    where: { label: "2025/2026" },
    update: {},
    create: {
      label: "2025/2026",
      startsAt: new Date(Date.UTC(2025, 6, 1)), // 1.7.2025
      endsAt: new Date(Date.UTC(2026, 5, 30, 23, 59, 59)), // 30.6.2026
      isClosed: false,
      openingBalanceMain: 59838.49,
      openingBalanceGG: -54.99,
    },
  });

  // --- Members from MB sheet ---
  const memberFile = "/workspace/uploads/EAR Rotary Wien Donau 2025-26.xlsx";
  if (fs.existsSync(memberFile)) {
    const wb = XLSX.readFile(memberFile);
    const ws = wb.Sheets["MB"];
    if (ws) {
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      // header row at index 8 (0-based)
      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (Array.isArray(r) && r.includes("Member ID")) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i] as (string | number | null)[];
          if (!r) continue;
          const memberCol = r[2]; // Member ID column
          const nameRaw = r[3];
          if (!nameRaw || typeof nameRaw !== "string" || !nameRaw.trim()) continue;
          const flag1 = r[0]; // 1 = active
          const flag2 = r[1]; // 'EZ' or '580' or 'Befreit'
          const address = (r[5] as string) ?? null;
          const city = (r[6] as string) ?? null;
          const postal = r[8] != null ? String(r[8]) : null;
          const country = (r[9] as string) ?? null;
          const businessPhone = (r[11] as string) ?? null;
          const residencePhone = (r[12] as string) ?? null;
          const mobilePhone = (r[13] as string) ?? null;
          const phone = mobilePhone ?? businessPhone ?? residencePhone ?? null;

          const name = nameRaw.trim();
          let firstName = "";
          let lastName = "";
          if (name.includes(",")) {
            const [l, f] = name.split(",");
            lastName = l.trim();
            firstName = (f ?? "").trim();
          } else {
            const parts = name.split(/\s+/);
            firstName = parts[0] ?? "";
            lastName = parts.slice(1).join(" ");
          }
          if (!lastName) lastName = firstName;

          const flag2Str = flag2 ? String(flag2) : "";
          const paysBySEPA = /\bEZ\b/i.test(flag2Str);
          const isExempt = /Befreit/i.test(flag2Str);
          const status = flag1 === 1 || flag1 === "1" ? "ACTIVE" : isExempt ? "EXEMPT" : flag1 ? "ACTIVE" : "ACTIVE";
          const duesAmount = isExempt ? 0 : 580;

          const data = {
            lastName,
            firstName,
            address,
            city,
            postalCode: postal,
            country,
            phone,
            paysBySEPA,
            isExempt,
            duesAmount,
            status,
            notes: flag2Str.length > 6 ? flag2Str : undefined,
            email: deriveEmail(firstName, lastName),
          };

          if (typeof memberCol === "number") {
            await prisma.member.upsert({
              where: { rotaryMemberId: memberCol },
              update: data,
              create: { rotaryMemberId: memberCol, ...data },
            });
          } else {
            // No rotary id → create only if not exists by name
            const existing = await prisma.member.findFirst({
              where: { lastName, firstName },
            });
            if (!existing) {
              await prisma.member.create({ data });
            }
          }
        }
      }
    }
  }

  // --- Transactions for 2025/2026 from "ERSTE Konto" sheet ---
  await importTransactionsFromExcel(memberFile, "ERSTE Konto", cy2526.id, main.id, false);
  // Global Grant
  await importTransactionsFromExcel(memberFile, "ERSTE Global Grant ", cy2526.id, gg.id, true);

  // --- Archive 2024/2025 from prior file (Abschluss summary only) ---
  const file2425 = "/workspace/uploads/EAR Rotary Wien Donau 2024-25.xlsx";
  if (fs.existsSync(file2425)) {
    await importArchiveSummary(file2425, "2024/2025", cy2425.id);
    // Also import transactions into pseudo year for chart compare
    await importTransactionsFromExcel(file2425, "ERSTE Konto", cy2425.id, main.id, false, true);
    await importTransactionsFromExcel(file2425, "ERSTE Global Grant ", cy2425.id, gg.id, true, true);
  }

  // --- Budget Lines from "Budget Neu" sheet (2026/27) – use as 2025/26 budget per Abschluß column "(Budget)" ---
  await importBudgetFromAbschluss(memberFile, cy2526.id);

  // --- Cashflow demo entries ---
  await prisma.cashflowEntry.deleteMany({ where: { clubYearId: cy2526.id } });
  await prisma.cashflowEntry.createMany({
    data: [
      { clubYearId: cy2526.id, date: new Date(Date.UTC(2025, 8, 1)), label: "Mitgliedsbeiträge SEPA-Lauf", amount: 35000, isPlanned: true },
      { clubYearId: cy2526.id, date: new Date(Date.UTC(2025, 9, 15)), label: "District Grant Erwartet", amount: 5000, isPlanned: true },
      { clubYearId: cy2526.id, date: new Date(Date.UTC(2025, 11, 10)), label: "Weihnachtsaktion", amount: -3000, isPlanned: true },
      { clubYearId: cy2526.id, date: new Date(Date.UTC(2026, 1, 28)), label: "Distrikt Halbjahresbeitrag", amount: -6000, isPlanned: true },
      { clubYearId: cy2526.id, date: new Date(Date.UTC(2026, 4, 15)), label: "RYLA Beitrag", amount: -5000, isPlanned: true },
    ],
  });

  // --- Generate dues invoices for 2025/26 ---
  await generateDues(cy2526.id);

  console.log("→ Seed done");
}

function deriveEmail(first: string, last: string) {
  if (!last) return null;
  const a = last.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-zA-Z]/g, "").toLowerCase();
  const b = first.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (!a) return null;
  return `${b ? b + "." : ""}${a}@example.org`;
}

// Column → Category mapping for EAR-Excel sheets
const MAIN_COL_MAP: Record<number, string> = {
  4: "Mitgliedsbeitrag",
  5: "Aufnahmegebühr",
  6: "RYLA Einnahmen",
  7: "Spenden Einnahmen",
  8: "Zinsen",
  9: "Präsenzaufwand Einnahmen",
  10: "Distriktsbeitrag",
  11: "Rotary Intl. & Foundation",
  12: "Spesen",
  13: "RYLA Ausgaben",
  14: "Clubprojekte / Spenden",
  15: "Präsenzaufwand",
  16: "Sonstige Ausgaben",
};
const GG_COL_MAP: Record<number, string> = {
  4: "Mitgliedsbeitrag",
  5: "Aufnahmegebühr",
  6: "Spenden Einnahmen",
  7: "Zinsen",
  8: "Sonstige Einnahmen",
  9: "Rotary Intl. & Foundation",
  10: "Distriktsbeitrag",
  11: "Spesen",
  12: "Clubprojekte / Spenden",
  13: "Saalmiete",
  14: "Sonstige Ausgaben",
};

async function importTransactionsFromExcel(file: string, sheetName: string, clubYearId: string, accountId: string, isGG: boolean, asArchive = false) {
  if (!fs.existsSync(file)) return;
  const wb = XLSX.readFile(file, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`Sheet ${sheetName} not found in ${file}`);
    return;
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  // detect header row containing "Datum"
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (Array.isArray(r) && r[0] === "Datum") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return;
  // Find KONTO column (running balance) – skip from amount calc.
  // KONTO appears in row above header (sub-header row).
  let kontoCol = -1;
  if (headerIdx > 0) {
    const above = rows[headerIdx - 1];
    if (Array.isArray(above)) {
      for (let i = 0; i < above.length; i++) {
        if (typeof above[i] === "string" && /KONTO/i.test(above[i] as string)) {
          kontoCol = i;
          break;
        }
      }
    }
  }
  // Fallback: 17 for Konto, 15 for GG; but better: detect by sheet name/heuristic
  if (kontoCol < 0) kontoCol = sheetName.includes("Global") ? 15 : 17;
  const lastAmountCol = kontoCol; // exclusive

  const cats = await prisma.category.findMany();
  const catByName = new Map(cats.map((c) => [c.name, c.id]));

  let inserted = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as (string | number | Date | null)[];
    if (!r) continue;
    const date = r[0];
    if (!(date instanceof Date)) continue;
    const text = (r[1] as string) ?? "";
    const code = (r[2] as string) ?? null;
    const note = (r[3] as string) ?? null;

    // Determine amount + category from the column it appears in.
    const colMap = isGG ? GG_COL_MAP : MAIN_COL_MAP;
    let amount = 0;
    let categoryName: string | null = null;
    for (let col = 4; col < lastAmountCol; col++) {
      const v = r[col];
      if (typeof v === "number" && v !== 0) {
        amount += v;
        const mapped = colMap[col];
        if (mapped && !categoryName) categoryName = mapped;
      }
    }
    if (amount === 0) continue;
    // Fallback to text-based heuristic if mapping didn't yield
    if (!categoryName) {
      const cat = autoCategoryName({ purpose: `${text} ${note ?? ""}`, counterparty: text, code, amount });
      categoryName = cat?.name ?? null;
    }
    const categoryId = categoryName ? catByName.get(categoryName) ?? null : null;

    // Try member-match by lastname token in text
    let memberId: string | null = null;
    const m = await tryMatchMember(`${text} ${note ?? ""}`);
    if (m) memberId = m.id;

    await prisma.transaction.create({
      data: {
        accountId,
        clubYearId,
        date,
        valueDate: date,
        counterparty: text || null,
        purpose: note,
        code,
        amount,
        categoryId,
        memberId,
        source: asArchive ? "ARCHIVE" : "IMPORT",
      },
    });
    inserted++;
  }
  console.log(`  • Imported ${inserted} txns from ${sheetName}`);
}

let memberCache: { lastName: string; firstName: string; id: string }[] | null = null;
async function tryMatchMember(hay: string) {
  if (!memberCache) {
    const ms = await prisma.member.findMany({ select: { id: true, lastName: true, firstName: true } });
    memberCache = ms;
  }
  const lower = hay.toLowerCase();
  for (const m of memberCache) {
    if (!m.lastName) continue;
    if (lower.includes(m.lastName.toLowerCase())) return m;
  }
  return null;
}

async function importArchiveSummary(file: string, label: string, clubYearId: string) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Abschluß"];
  if (!ws) return;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // Walk rows, picking lines where col[3] is number (Ist) and col[0] is name
  const income: Record<string, number> = {};
  const expense: Record<string, number> = {};
  let mode: "INCOME" | "EXPENSE" | null = null;
  for (const r of rows) {
    const a = r[0];
    if (typeof a === "string") {
      const s = a.trim();
      if (s === "EINNAHMEN") {
        mode = "INCOME";
        continue;
      }
      if (s === "AUSGABEN") {
        mode = "EXPENSE";
        continue;
      }
      if (mode && typeof r[3] === "number") {
        if (mode === "INCOME") income[s] = (income[s] ?? 0) + (r[3] as number);
        else expense[s] = (expense[s] ?? 0) + (r[3] as number);
      }
    }
  }
  await prisma.archivedYear.upsert({
    where: { clubYearId },
    update: {
      summaryJson: JSON.stringify({ label, income, expense }),
      fileName: path.basename(file),
    },
    create: {
      clubYearId,
      summaryJson: JSON.stringify({ label, income, expense }),
      fileName: path.basename(file),
    },
  });
  console.log(`  • Archive summary written for ${label}`);
}

async function importBudgetFromAbschluss(file: string, clubYearId: string) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Abschluß"];
  if (!ws) return;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const cats = await prisma.category.findMany();
  const lookup = (s: string): string | null => {
    const x = s.trim().toLowerCase();
    const map: Record<string, string> = {
      mitgliedsbeiträge: "Mitgliedsbeitrag",
      mitgliedsbeitraege: "Mitgliedsbeitrag",
      mitgliedsbeitrag: "Mitgliedsbeitrag",
      aufnahmegebühren: "Aufnahmegebühr",
      aufnahmegebuehren: "Aufnahmegebühr",
      ryla: "RYLA Einnahmen",
      spenden: "Spenden Einnahmen",
      "zinsen + sonstiges": "Zinsen",
      "zinsen + sonstiges ": "Zinsen",
      "rotary (distriktsbeitrag, sets/pets…)": "Distriktsbeitrag",
      "rotary intl. und foundationspende, magazin": "Rotary Intl. & Foundation",
      spesen: "Spesen",
      clubprojekte: "Clubprojekte / Spenden",
      "global grant": "Global Grant",
      präsenzaufwand: "Präsenzaufwand",
      praesenzaufwand: "Präsenzaufwand",
      "sonstiges": "Sonstige Ausgaben",
      "sonstiges ": "Sonstige Ausgaben",
    };
    const target = map[x];
    if (!target) return null;
    return cats.find((c) => c.name === target)?.id ?? null;
  };

  let mode: "INCOME" | "EXPENSE" | null = null;
  for (const r of rows) {
    const a = r[0];
    if (typeof a === "string") {
      const s = a.trim();
      if (s === "EINNAHMEN") {
        mode = "INCOME";
        continue;
      }
      if (s === "AUSGABEN") {
        mode = "EXPENSE";
        continue;
      }
      if (mode && typeof r[4] === "number") {
        const catId = lookup(s);
        if (!catId) continue;
        const sign = mode === "INCOME" ? 1 : -1;
        const amount = sign * Math.abs(r[4] as number);
        await prisma.budgetLine.upsert({
          where: { clubYearId_categoryId: { clubYearId, categoryId: catId } },
          update: { amount },
          create: { clubYearId, categoryId: catId, amount },
        });
      }
    }
  }
  console.log("  • Budget lines written");
}

async function generateDues(clubYearId: string) {
  const members = await prisma.member.findMany({
    where: { isExempt: false, status: "ACTIVE", duesAmount: { gt: 0 } },
  });
  const cy = await prisma.clubYear.findUnique({ where: { id: clubYearId } });
  if (!cy) return;
  const dueDate = new Date(cy.startsAt);
  dueDate.setUTCDate(dueDate.getUTCDate() + 60);
  for (const m of members) {
    const reference = `MB-${cy.label.replace("/", "-")}-${m.rotaryMemberId ?? m.id.slice(0, 8)}`;
    const existing = await prisma.invoice.findUnique({ where: { reference } });
    if (existing) continue;
    await prisma.invoice.create({
      data: {
        type: "DUES",
        memberId: m.id,
        clubYearId,
        dueDate,
        amount: m.duesAmount,
        status: "OPEN",
        reference,
        description: `Mitgliedsbeitrag Clubjahr ${cy.label}`,
        paymentMethod: m.paysBySEPA ? "SEPA" : "EMAIL_INVOICE",
      },
    });
  }
  console.log("  • Dues invoices generated");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });