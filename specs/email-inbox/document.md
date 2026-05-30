# Belege per Mail-Weiterleitung

## Overview

Treasurer leitet Lieferanten-Rechnungen per Mail an eine Inbound-Adresse
weiter. Die App speichert Mail + Anhänge, versucht eine automatische
Zuordnung zur passenden Bank-Buchung und stellt sie in einer Inbox zur
manuellen Bestätigung. Rechnungsprüfer sieht zu jeder Buchung die Original-
Mail samt Anhängen.

## Goals

- "Forward and forget"-Workflow für > 90 % der Belege.
- Vollständiger Audit-Trail (Sender, Betreff, Empfangsdatum, Mail-Body) je
  Beleg.
- Kein eigener MX-Record nötig (Vercel-Domain reicht), weil Postmark eine
  fertige Inbound-Adresse vergibt.
- Unter 200 Belegen/Monat → Vercel-Blob Hobby + Postmark Free Tier reichen.

## Scope / non-goals

- **In scope:** Postmark-Webhook, .eml-Upload, Auto-Match auf Bank-Buchungen,
  manuelle Inbox-Zuordnung, Beleg-Anzeige am Buchungssatz.
- **Out of scope:** OCR auf gescannten Bildquittungen, Reply-Mails an
  Absender, Mail-Weiterleitung ans Buchhaltungs-Team, e-Rechnung-XML-
  Verarbeitung.

## User flows

### A) Manuelles Hochladen (Phase 1, sofort)

1. Treasurer öffnet `/transactions/<id>` → Bereich „Belege & Original-
   Mails".
2. Drop-Zone akzeptiert PDF, Bild, .eml, .msg.
3. Bei .eml: Mailparser zieht Header + Body; alle Anhänge werden ebenfalls
   als eigene Attachment-Records gespeichert.
4. Liste der Belege erscheint; Klick öffnet PDF inline; Klick auf
   „aus Mail von …" zeigt Modal mit Sender/Betreff/Body.

### B) Postmark-Forward (Phase 2)

1. Treasurer richtet bei seinem Mail-Provider eine Filterregel ein:
   „Mails mit Anhang von <Lieferanten-Liste>" → weiterleiten an
   `<hash>@inbound.postmarkapp.com`.
2. Postmark POSTet das JSON an `/api/inbox/postmark` (Basic-Auth).
3. App parst, speichert, extrahiert (Betrag/IBAN/Rechnungs-Nr.), matcht
   gegen offene Bank-Buchungen.
4. Bei Score ≥ 0.85 + eindeutigem Top-Treffer: Auto-Link, Mail-Status
   `MATCHED`, Belege erscheinen direkt am Buchungssatz.
5. Sonst: Mail landet in `/belege`-Inbox mit Top-3-Vorschlagsliste; ein
   Klick „Zuordnen" verknüpft.

## Functional requirements

| Feld | Quelle | Wann |
|---|---|---|
| `MailInbox.fromAddress` | Postmark `FromFull.Email` / .eml `From` | Pflicht |
| `MailInbox.subject` | Postmark `Subject` | optional |
| `MailInbox.receivedAt` | Postmark `Date` / .eml `Date` | Pflicht |
| `MailInbox.messageId` | RFC-Message-ID | Dedupe (unique) |
| `MailInbox.htmlBody` | Postmark `HtmlBody` | Anzeige |
| `MailInbox.textBody` | Postmark `TextBody` | Anzeige + Match |
| `MailInbox.extractedAmount/Iban/InvNo` | PDF + Mail-Body | Match-Heuristik |
| `MailInbox.matchedTxId/At/ById/Confidence` | Heuristik / manuell | Audit |
| `Attachment.mailInboxId` | Webhook | Reverse-Link |
| `TransactionAttachment(source=MAIL_AUTO\|MAIL_MANUAL\|UPLOAD)` | Verknüpfung | Buchungs-View |

Match-Heuristik (Score 0..1):

- Betrag exakt: +0.5 (±0,01 €), 0.5 € Toleranz: +0.3
- Datum innerhalb ±45 Tage: linear bis +0.15
- IBAN aus Rechnung in `purpose/counterparty`: +0.25
- Rechnungs-Nr. in `code/purpose/note`: +0.20
- Domain/Name des Absenders im `counterparty`: +0.10/+0.05

Auto-Link nur bei Score ≥ 0.85 UND `top - second ≥ 0.15`.

## API contracts

- `POST /api/transactions/:id/attachments` (Treasurer) — multipart upload
- `DELETE /api/transactions/:id/attachments/:attachmentId` (Treasurer)
- `GET /api/attachments/:id` (alle eingeloggten Rollen) — streamt Inhalt
- `GET /api/mail-inbox/:id/body` — sandboxed HTML der Original-Mail
- `POST /api/inbox/postmark` (Basic-Auth) — Postmark-Webhook
- `POST /api/mail-inbox/:id/assign { transactionId }` — manueller Match
- `POST /api/mail-inbox/:id/dismiss` — Mail verwerfen
- `GET /api/transactions/search?q=…` — manuelle Suche in Inbox-UI

## Edge cases / failure modes

- **Postmark retry:** `messageId` ist UNIQUE → Idempotenz garantiert.
- **PDF nicht parsbar** (Bilder-PDF / verschlüsselt): Match nur per
  Mail-Body-Heuristik. Mail landet in Inbox.
- **Mehrere Buchungen mit gleichem Betrag** (z. B. wiederkehrende
  Beträge): Auto-Link-Schwelle `top - second ≥ 0.15` greift; Mail bleibt
  in Inbox, beide Vorschläge angezeigt.
- **Falsche Auto-Zuordnung:** Treasurer kann Beleg in der Buchungs-Detail-
  Seite löschen; das löscht aber NUR die Verknüpfung. Mail kann erneut
  zugeordnet werden, indem im DB-Eintrag `status` zurückgesetzt wird
  (kommt nur sehr selten vor; bewusst kein UI-Knopf, um Daten-Drift zu
  vermeiden).
- **Vercel Blob nicht konfiguriert:** lokal automatischer Fallback in
  `uploads/blob-local/`. Auf Vercel-Prod muss `BLOB_READ_WRITE_TOKEN` in
  den Project-Env-Vars stehen (Vercel Storage → Connect Blob).
- **Anhang > 25 MB:** Upload-Endpunkt antwortet 413; Postmark-Limit ist
  ohnehin 35 MB pro Mail.

## Acceptance criteria

- [x] PDF kann auf einer Buchung manuell hochgeladen werden.
- [x] .eml-Datei wird beim Upload geparst, Header/Body sichtbar.
- [x] Inbound-Mail mit PDF wird automatisch zugeordnet, wenn Betrag,
      Datum, IBAN passen.
- [x] Inbox `/belege` zeigt ungematchte Mails mit Top-3-Vorschlägen.
- [x] „Zuordnen"-Button verknüpft Mail + alle Anhänge mit der Buchung.
- [x] Beleg-Download nur für eingeloggte Rollen (treasurer/auditor/admin/
      president).
- [x] Rechnungsprüfer-Rolle (`auditor`) hat Vollzugriff inkl. Belege.

## Test plan

Manuell auf Vercel-Prod:

1. Vercel-Blob in Dashboard verbinden → `BLOB_READ_WRITE_TOKEN` setzt
   sich automatisch.
2. Schema migrieren: `npx prisma db push`.
3. Auf `/transactions/<id>` PDF hochladen → Vorschau klappt, Beleg im
   Audit-Stream.
4. Postmark-Account anlegen → Inbound-Server → Webhook-URL setzen + Basic-
   Auth-Credentials in Vercel-Env. Test-Mail vom Postmark-Dashboard
   abschicken.
5. Aus echtem Mailaccount eine Lieferanten-PDF an Inbound-Adresse
   forwarden → in Vercel-Function-Logs prüfen, ob Auto-Match korrekt.
6. Match-Schwelle prüfen: Mail mit Betrag, der zu mehreren Buchungen
   passt → muss in Inbox landen, nicht auto-linken.

## Implementation notes

- **Storage**: `@vercel/blob` v2 mit `access: "public"`. Die zufällige
  URL fungiert als Capability; das App-API-Gate (`/api/attachments/:id`)
  zwingt zusätzlich auf NextAuth-Session, damit URLs nicht extern leaken
  müssen.
- **PDF-Extraktion**: gleiches `pdfjs-serverless` wie für SEPA-Import.
- **Mail-Parser**: `mailparser` (Node) für `.eml` beim Upload. Postmark
  liefert ohnehin schon strukturiertes JSON.
- **Transaction-Attachment-Migration**: bisherige 1:1 `Transaction.attachmentId`
  bleibt; neue Belege gehen über `TransactionAttachment`-Join. Detailseite
  rendert beide Quellen als ein Stream.

## Status / open questions

- [x] Phase 1 (manueller Upload) — implementiert.
- [x] Phase 2 (Postmark-Webhook + Inbox + Auto-Match) — implementiert.
- [ ] Vercel-Blob aktivieren + Postmark-Inbound-Server einrichten (User-
      Action, siehe README-Schritte unten).
- [ ] Auditor-Login: User legt das Konto via `/settings/users` selbst an
      (Rolle „Rechnungsprüfer").