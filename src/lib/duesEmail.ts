/**
 * Baut die Rechnungs-E-Mail für den Mitgliedsbeitrag (Erstversand).
 *
 * Der Beitrag ist ab 1.7. fällig und bis 30.9. zu bezahlen. Versendet wird nur
 * an Mitglieder OHNE Einzugsermächtigung (EZ/SEPA) und die nicht befreit sind –
 * SEPA-Mitglieder werden automatisch abgebucht und erhalten keine Rechnung.
 *
 * Bankverbindung ist über ENV konfigurierbar (CLUB_IBAN), sonst Standard.
 */

import { formatEUR, formatDate } from "@/lib/format";

const CLUB_NAME = "Rotary Club Wien-Donau";
const CLUB_IBAN = (process.env.CLUB_IBAN ?? "AT41 2011 1310 0670 0296").trim();

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildDuesInvoiceEmail(opts: {
  memberName: string;
  salutation?: string | null;
  amount: number;
  reference: string;
  dueDate: Date;
  clubYearLabel: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const anrede = (opts.salutation && opts.salutation.trim()) || `Liebe Freundin, lieber Freund ${opts.memberName}`;
  const betrag = formatEUR(opts.amount);
  const faellig = formatDate(opts.dueDate);
  const subject = `Mitgliedsbeitrag Clubjahr ${opts.clubYearLabel} – Rechnung ${opts.reference}`;

  const textBody =
    `${anrede},\n\n` +
    `wir stellen Ihnen den Mitgliedsbeitrag für das Clubjahr ${opts.clubYearLabel} in Rechnung.\n\n` +
    `Betrag:            ${betrag}\n` +
    `Referenz:          ${opts.reference}\n` +
    `Fällig ab:         1.7.\n` +
    `Zahlbar bis:       ${faellig}\n\n` +
    `Wir bitten um Überweisung auf folgendes Konto:\n` +
    `IBAN:              ${CLUB_IBAN}\n` +
    `Verwendungszweck:  ${opts.reference}\n\n` +
    `Bei Rückfragen stehe ich gerne zur Verfügung.\n\n` +
    `Mit besten rotarischen Grüßen,\nDer Schatzmeister\n${CLUB_NAME}`;

  const htmlBody = `
    <div style="font-family:'Open Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="background:#17458F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Rotary Club</div>
        <div style="font-size:20px;font-weight:700">Wien-Donau</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
        <p style="margin:0 0 12px">${escapeHtml(anrede)},</p>
        <p style="margin:0 0 16px">wir stellen Ihnen den <strong>Mitgliedsbeitrag für das Clubjahr ${escapeHtml(opts.clubYearLabel)}</strong> in Rechnung.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b">Betrag</td><td style="padding:6px 0;text-align:right;font-weight:700">${escapeHtml(betrag)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Referenz</td><td style="padding:6px 0;text-align:right;font-family:monospace">${escapeHtml(opts.reference)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Fällig ab</td><td style="padding:6px 0;text-align:right">1.7.</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Zahlbar bis</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(faellig)}</td></tr>
        </table>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:0 0 20px">
          <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Bankverbindung</div>
          <div style="font-size:14px;margin-bottom:4px">IBAN <strong style="font-family:monospace">${escapeHtml(CLUB_IBAN)}</strong></div>
          <div style="font-size:14px">Verwendungszweck <strong style="font-family:monospace">${escapeHtml(opts.reference)}</strong></div>
        </div>
        <p style="margin:0 0 20px">Bei Rückfragen stehe ich gerne zur Verfügung.</p>
        <p style="margin:0;font-size:13px;color:#64748b">Mit besten rotarischen Grüßen,<br/>Der Schatzmeister<br/>${escapeHtml(CLUB_NAME)}</p>
      </div>
    </div>`;

  return { subject, htmlBody, textBody };
}