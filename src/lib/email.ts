/**
 * Outbound-E-Mail via Postmark Email-API.
 *
 * Benötigte ENV:
 *  - POSTMARK_SERVER_TOKEN : Server-API-Token (Postmark → Server → API Tokens)
 *  - EMAIL_FROM            : verifizierte Absender-Adresse (Sender Signature / Domain)
 *
 * Ist keine Config vorhanden, wird NICHT versendet, sondern `skipped: true`
 * zurückgegeben. Aufrufer müssen daraus KEINE Info an den Client durchreichen
 * (User-Enumeration / Klartext-Link vermeiden).
 */

export type SendMailResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(
    (process.env.POSTMARK_SERVER_TOKEN ?? "").trim() &&
      (process.env.EMAIL_FROM ?? "").trim(),
  );
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo?: string;
}): Promise<SendMailResult> {
  const token = (process.env.POSTMARK_SERVER_TOKEN ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();

  if (!token || !from) {
    console.warn(
      "[email] POSTMARK_SERVER_TOKEN oder EMAIL_FROM fehlt – E-Mail wird nicht versendet.",
    );
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: opts.to,
        Subject: opts.subject,
        HtmlBody: opts.htmlBody,
        TextBody: opts.textBody,
        MessageStream: "outbound",
        ...(opts.replyTo ? { ReplyTo: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Postmark ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `postmark_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] Versand fehlgeschlagen:", e);
    return { ok: false, error: "network" };
  }
}

/** Basis-URL für Links in Mails. Bevorzugt NEXTAUTH_URL, sonst Request-Origin. */
export function baseUrlFrom(req: Request): string {
  const env = (process.env.NEXTAUTH_URL ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}