import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets["MB"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) return NextResponse.json({ error: "kein Sheet" }, { status: 400 });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (Array.isArray(r) && r.includes("Member ID")) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return NextResponse.json({ error: "Header 'Member ID' nicht gefunden" }, { status: 400 });

  let created = 0, updated = 0, skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as (string | number | null)[];
    if (!r) { skipped++; continue; }
    const memberCol = r[2];
    const nameRaw = r[3];
    if (!nameRaw || typeof nameRaw !== "string" || !nameRaw.trim()) { skipped++; continue; }
    const flag1 = r[0];
    const flag2 = r[1];
    const address = (r[5] as string) ?? null;
    const city = (r[6] as string) ?? null;
    const postal = r[8] != null ? String(r[8]) : null;
    const country = (r[9] as string) ?? "Austria";
    const phone = (r[13] as string) ?? (r[11] as string) ?? (r[12] as string) ?? null;
    const name = nameRaw.trim();
    let firstName = "", lastName = "";
    if (name.includes(",")) { const [l, f] = name.split(","); lastName = l.trim(); firstName = (f ?? "").trim(); }
    else { const parts = name.split(/\s+/); firstName = parts[0] ?? ""; lastName = parts.slice(1).join(" "); }
    if (!lastName) lastName = firstName;

    const flag2Str = flag2 ? String(flag2) : "";
    const paysBySEPA = /\bEZ\b/i.test(flag2Str);
    const isExempt = /Befreit/i.test(flag2Str);
    const status = isExempt ? "EXEMPT" : flag1 ? "ACTIVE" : "ACTIVE";
    const duesAmount = isExempt ? 0 : 580;

    const data = { lastName, firstName, address, city, postalCode: postal, country, phone, paysBySEPA, isExempt, duesAmount, status, notes: flag2Str.length > 6 ? flag2Str : null };

    if (typeof memberCol === "number") {
      const existing = await prisma.member.findUnique({ where: { rotaryMemberId: memberCol } });
      if (existing) {
        await prisma.member.update({ where: { rotaryMemberId: memberCol }, data });
        updated++;
      } else {
        await prisma.member.create({ data: { rotaryMemberId: memberCol, ...data } });
        created++;
      }
    } else {
      const exist = await prisma.member.findFirst({ where: { lastName, firstName } });
      if (exist) { await prisma.member.update({ where: { id: exist.id }, data }); updated++; }
      else { await prisma.member.create({ data }); created++; }
    }
  }
  return NextResponse.json({ created, updated, skipped });
}