# Feature: Passwort zurücksetzen (Self-Service + Admin)

## Overview
Zwei Wege, um ein Benutzer-Passwort neu zu setzen:
1. **Admin-Reset** (bereits umgesetzt): Schatzmeister/Admin setzt in der Benutzerverwaltung
   (`/settings/users`) je Zeile ein neues Passwort via `PATCH /api/users/[id]`.
2. **Self-Service** (dieses Dokument): Benutzer klickt auf „Passwort vergessen?", erhält per
   E-Mail einen zeitlich begrenzten Reset-Link und vergibt selbst ein neues Passwort.

## Goals
- Ausgesperrte Benutzer können sich ohne Admin selbst wieder Zugang verschaffen.
- Kein Klartext-Passwortversand; nur ein signierter, einmaliger, kurzlebiger Link.
- Keine User-Enumeration: Die Anfrage-Seite antwortet immer generisch.

## Scope / non-goals
- **In scope:** Forgot-Password-Formular, Token-Erzeugung/-Validierung, Reset-Formular,
  Postmark-Outbound-Mailversand, Login-Link.
- **Non-goals:** 2FA, Magic-Link-Login (passwortlos), SMS, Passwort-Historie/-Policies über
  „min. 8 Zeichen" hinaus.

## User flows / UX
1. Login-Seite → Link „Passwort vergessen?" → `/forgot-password`.
2. Benutzer gibt E-Mail ein → Absenden → immer generische Bestätigung
   („Falls ein Konto existiert, wurde eine E-Mail gesendet.").
3. E-Mail enthält Button/Link `/{NEXTAUTH_URL}/reset-password?token=RAW` (60 Min gültig).
4. Reset-Seite: neues Passwort + Wiederholung → Absenden → Erfolg → Weiterleitung `/login`.
5. Fehlerfälle: abgelaufener/ungültiger/bereits genutzter Token → klare Meldung + Link,
   erneut anzufordern.

## Functional requirements
- Token: 32 zufällige Bytes (hex). Es wird **nur der SHA-256-Hash** in der DB gespeichert;
  der Rohtoken steht ausschließlich im Link.
- Gültigkeit: 60 Minuten (`expiresAt`). Einmalig (`usedAt`).
- Beim Anfordern: alle noch offenen Tokens des Users invalidieren (löschen), dann genau einen
  neuen anlegen.
- Beim Reset: Passwort min. 8 Zeichen, mit bcrypt gehasht (Kostenfaktor 10). Nach Erfolg Token
  als genutzt markieren.
- E-Mail-Adressen werden bei Lookup `trim().toLowerCase()`.

## Data model / schema
```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique   // sha256(rawToken)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([userId])
  @@index([expiresAt])
}
```

## API contracts
- `POST /api/auth/forgot-password`  Body `{ email }` → immer `200 { ok: true }` (generisch).
- `POST /api/auth/reset-password`   Body `{ token, password }` →
  - `200 { ok: true }` bei Erfolg
  - `400 { error }` bei zu kurzem Passwort
  - `410 { error }` bei ungültigem/abgelaufenem/genutztem Token

## Edge cases / failure modes
- Unbekannte E-Mail → generische Antwort, keine Mail, kein Token.
- Postmark nicht konfiguriert (`POSTMARK_SERVER_TOKEN`/`EMAIL_FROM` fehlen) → Anfrage bleibt
  generisch `200`, Server-Log weist Admin auf fehlende Config hin; es wird **kein** Link
  im Klartext an den Client zurückgegeben.
- Token doppelt verwendet → `410`.
- Uhrzeit/Abgelaufen → `410`.

## Acceptance criteria
- „Passwort vergessen?" auf Login sichtbar und verlinkt `/forgot-password`.
- Gültiger Link setzt Passwort neu; danach Login mit neuem Passwort möglich.
- Abgelaufener/genutzter Link führt zu klarer Fehlermeldung, kein Passwortwechsel.
- Keine Antwortunterschiede zwischen existierender/nicht existierender E-Mail.

## Test plan / test cases
1. Forgot mit existierender Mail → Token in DB, Mail versendet (bei konfiguriertem Postmark).
2. Forgot mit unbekannter Mail → 200, kein Token.
3. Reset mit gültigem Token + PW ≥ 8 → 200, `usedAt` gesetzt, Login funktioniert.
4. Reset mit selbem Token erneut → 410.
5. Reset mit abgelaufenem Token (expiresAt in Vergangenheit) → 410.
6. Reset mit PW < 8 → 400.

## Implementation notes
- Outbound-Mail: Postmark Email-API `POST https://api.postmarkapp.com/email`,
  Header `X-Postmark-Server-Token`, `MessageStream: "outbound"`.
- Base-URL für Links: `NEXTAUTH_URL` (Fallback: Request-Origin).
- Helper: `src/lib/email.ts` (`sendMail`), `src/lib/passwordReset.ts` (Token erzeugen/prüfen).

## Status / open questions
- Status: in-progress.
- Benötigt Secrets `POSTMARK_SERVER_TOKEN` + `EMAIL_FROM` (verifizierte Absender-Adresse/Domain
  in Postmark) für tatsächlichen Versand.