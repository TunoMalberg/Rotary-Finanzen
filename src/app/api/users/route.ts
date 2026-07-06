import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import bcrypt from "bcryptjs";

const VALID_ROLES = ["treasurer", "president", "admin", "auditor"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Bitte eine gültige E-Mail angeben." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Bitte einen Namen angeben." }, { status: 400 });
  if (!VALID_ROLES.includes(role))
    return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "Passwort muss mindestens 8 Zeichen haben." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return NextResponse.json({ error: `E-Mail „${email}" ist bereits vergeben.` }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const u = await prisma.user.create({
    data: { email, name, role, passwordHash },
  });
  return NextResponse.json({ id: u.id, email: u.email, name: u.name, role: u.role });
}