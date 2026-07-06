import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import bcrypt from "bcryptjs";

const VALID_ROLES = ["treasurer", "president", "admin", "auditor"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const data: { name?: string; role?: string; email?: string; passwordHash?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400 });
    data.name = name;
  }
  if (body.role !== undefined) {
    const role = String(body.role).trim();
    if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
    data.role = role;
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "Bitte eine gültige E-Mail angeben." }, { status: 400 });
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== id)
      return NextResponse.json({ error: `E-Mail „${email}" ist bereits vergeben.` }, { status: 409 });
    data.email = email;
  }
  if (body.password !== undefined && body.password !== "") {
    const password = String(body.password);
    if (password.length < 8)
      return NextResponse.json({ error: "Passwort muss mindestens 8 Zeichen haben." }, { status: 400 });
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "Keine Änderungen übergeben." }, { status: 400 });

  const u = await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ id: u.id, email: u.email, name: u.name, role: u.role });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  if (id === session?.user?.id) return NextResponse.json({ error: "Eigenen Account nicht löschbar" }, { status: 400 });
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}