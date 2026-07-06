import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyResetToken, consumeResetToken } from "@/lib/passwordReset";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password  { token, password }
 *
 *  200 { ok:true }  → Passwort gesetzt
 *  400 { error }    → Passwort zu kurz
 *  410 { error }    → Token ungültig / abgelaufen / bereits verwendet
 */
export async function POST(req: Request) {
  let token = "";
  let password = "";
  try {
    const body = await req.json();
    token = String(body?.token ?? "");
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (password.length < 8)
    return NextResponse.json(
      { error: "Passwort muss mindestens 8 Zeichen haben." },
      { status: 400 },
    );

  const userId = await verifyResetToken(token);
  if (!userId)
    return NextResponse.json(
      { error: "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an." },
      { status: 410 },
    );

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await consumeResetToken(token);

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/auth/reset-password?token=…  → Token-Vorabprüfung für die Seite.
 * { valid: boolean }
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const userId = await verifyResetToken(token);
  return NextResponse.json({ valid: Boolean(userId) });
}