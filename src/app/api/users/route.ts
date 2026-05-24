import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const passwordHash = await bcrypt.hash(body.password, 10);
  try {
    const u = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        role: body.role,
        passwordHash,
      },
    });
    return NextResponse.json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch {
    return NextResponse.json({ error: "E-Mail existiert bereits" }, { status: 409 });
  }
}