import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createResetToken } from "@/lib/passwordReset";
import { sendMail, baseUrlFrom, isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot-password  { email }
 *
 * Antwortet IMMER generisch mit 200 (keine User-Enumeration).
 * Existiert das Konto und ist Postmark konfiguriert, wird ein Reset-Link
 * per E-Mail versendet.
 */
export async function POST(req: Request) {
  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    // ignore – generische Antwort unten
  }

  const generic = NextResponse.json({ ok: true });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic;

  // Alle unerwarteten Fehler (z. B. DB nicht erreichbar) verschlucken und
  // generisch antworten – keine User-Enumeration, kein Timing-/Fehler-Leak.
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return generic; // keine Enumeration

    if (!isEmailConfigured()) {
      console.warn(
        `[forgot-password] Kein Mailversand möglich (POSTMARK_SERVER_TOKEN/EMAIL_FROM fehlen). Reset für ${email} angefragt.`,
      );
      return generic;
    }

    const raw = await createResetToken(user.id);
    const base = baseUrlFrom(req);
    const link = `${base}/reset-password?token=${raw}`;

    const subject = "Passwort zurücksetzen – Rotary Club Wien-Donau";
    const textBody =
      `Hallo ${user.name},\n\n` +
      `für Ihr Konto (${email}) wurde ein Zurücksetzen des Passworts angefragt.\n\n` +
      `Öffnen Sie den folgenden Link, um ein neues Passwort zu vergeben (gültig 60 Minuten):\n` +
      `${link}\n\n` +
      `Wenn Sie das nicht angefragt haben, können Sie diese E-Mail ignorieren.\n\n` +
      `Rotary Club Wien-Donau – Schatzmeisterei`;

    const htmlBody = `
      <div style="font-family:'Open Sans',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <div style="background:#17458F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Rotary Club</div>
          <div style="font-size:20px;font-weight:700">Wien-Donau</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
          <p style="margin:0 0 12px">Hallo ${escapeHtml(user.name)},</p>
          <p style="margin:0 0 16px">für Ihr Konto <strong>${escapeHtml(email)}</strong> wurde ein Zurücksetzen des Passworts angefragt.</p>
          <p style="margin:0 0 20px">Klicken Sie auf den Button, um ein neues Passwort zu vergeben. Der Link ist <strong>60&nbsp;Minuten</strong> gültig.</p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="display:inline-block;background:#17458F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Neues Passwort vergeben</a>
          </p>
          <p style="margin:0 0 6px;font-size:12px;color:#64748b">Falls der Button nicht funktioniert, kopieren Sie diesen Link:</p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#334155">${link}</p>
          <p style="margin:0;font-size:12px;color:#94a3b8">Wenn Sie das nicht angefragt haben, ignorieren Sie diese E-Mail einfach.</p>
        </div>
      </div>`;

    // Fehler werden geloggt, aber nicht an den Client durchgereicht.
    await sendMail({ to: email, subject, htmlBody, textBody });
  } catch (e) {
    console.error("[forgot-password] unerwarteter Fehler:", e);
  }
  return generic;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}