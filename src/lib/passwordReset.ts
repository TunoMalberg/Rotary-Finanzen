import crypto from "crypto";
import { prisma } from "./prisma";

/** Gültigkeitsdauer eines Reset-Tokens in Minuten. */
export const RESET_TOKEN_TTL_MIN = 60;

/** SHA-256-Hash (hex) des Rohtokens – nur der Hash wird gespeichert. */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Erzeugt einen neuen Reset-Token für den User, invalidiert dabei alle
 * bestehenden Tokens desselben Users. Gibt den ROHTOKEN zurück (nur für den
 * Mail-Link; in der DB liegt ausschließlich der Hash).
 */
export async function createResetToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60_000);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return raw;
}

/**
 * Prüft einen Rohtoken. Gibt `userId` zurück, wenn der Token gültig
 * (existiert, nicht abgelaufen, nicht genutzt) ist – sonst `null`.
 */
export async function verifyResetToken(raw: string): Promise<string | null> {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!rec) return null;
  if (rec.usedAt) return null;
  if (rec.expiresAt.getTime() < Date.now()) return null;
  return rec.userId;
}

/** Markiert den Token als genutzt (einmalige Verwendung). */
export async function consumeResetToken(raw: string): Promise<void> {
  const tokenHash = hashToken(raw);
  await prisma.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  });
}