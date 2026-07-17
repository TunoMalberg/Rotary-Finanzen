# Rotary Finance App — Kontext- & Übergabe-Dokument

> **Zweck dieses Dokuments:** Vollständige Zusammenfassung des Projektstands, damit die
> Entwicklung in einem neuen Chat-/Kontext-Window nahtlos fortgesetzt werden kann.
> Zuletzt aktualisiert nach Commit `5b62942`.

---

## 1. Projektüberblick

Finanz- und Mitgliederverwaltung für den **Rotary Club Wien-Donau** (Distrikt 1910).
Der Schatzmeister verwaltet damit Buchungen, Konten, Mitglieder, Mitgliedsbeiträge,
Mahnwesen, Projekte, Budget, Anwesenheitslisten und Jahresabschlüsse.

- **Live-URL:** https://rotary-finanzen.vercel.app
- **GitHub-Repo:** https://github.com/TunoMalberg/Rotary-Finanzen
- **Hosting:** Vercel (Auto-Deploy bei Push auf `main`)
- **Version prüfen:** `curl https://rotary-finanzen.vercel.app/api/version` → liefert Commit-Hash + Build-Info

---

## 2. Tech-Stack

| Bereich        | Technologie |
|----------------|-------------|
| Framework      | Next.js 15 (App Router, `export const dynamic = "force-dynamic"`) |
| Sprache        | TypeScript, React 18 |
| Styling        | Tailwind CSS (Custom-Klassen: `btn-primary`, `btn-ghost`, `card-soft`, `input`, `chip`, `data-table`) |
| ORM            | Prisma 6 |
| DB (Prod)      | Neon Postgres (via `DATABASE_URL` in Vercel) |
| DB (Local)     | SQLite-Platzhalter `file:./dev.db` — **DB-Flows lokal NICHT testbar** |
| Auth           | NextAuth (Credentials, Rollen) |
| E-Mail out     | Postmark Email-API (`src/lib/email.ts`) |
| E-Mail in      | Postmark Inbound Webhook (`/api/inbox/postmark`) |
| Datei-Speicher | Vercel Blob (`src/lib/blobStorage.ts`) — Vercel-FS ist **read-only** außer `/tmp` |
| Icons          | lucide-react |
| Build-Script   | `prisma generate && prisma db push --skip-generate --accept-data-loss && BUILD_DIR=.next-build next build` |

> **Wichtig:** Vercel-Filesystem ist read-only. Niemals `fs.writeFile` nach `process.cwd()`
> → sonst HTTP 500. Immer Vercel Blob nutzen. Nur `/tmp` ist beschreibbar.

---

## 3. Zentrale fachliche Regeln (Business Rules)

### Rotarisches Clubjahr: 1.7. – 30.6.
- `startsAt = Date.UTC(startYear, 6, 1)` (Monat-Index **6 = Juli**)
- `endsAt   = Date.UTC(startYear+1, 5, 30, 23, 59, 59)` (Monat-Index 5 = Juni)
- Jede Buchung wird **strikt anhand ihres Datums** dem korrekten Clubjahr zugeordnet
  (`ensureClubYearForDate()` in `src/lib/clubYearLifecycle.ts`), NICHT anhand eines Formularfelds.

### Saldo / Eröffnungssaldo
- Saldo pro Clubjahr = `opening + Σ tx(clubYearId, deletedAt=null)`.
- Eröffnungssaldo Jahr N+1 = Schlusssaldo Jahr N (Kette). Beim Schließen (`close`) wird das gesetzt.
- Reparatur: `src/lib/recomputeOpenings.ts` → berechnet die Übernahme-Kette neu (`dryRun` möglich).

### Clubjahr-Lebenszyklus
`OPEN → CLOSED → AUDITED → LOCKED (lockedAt)`
- `checkClubYearMutable()` schützt Mutationen.
- `allowCorrection: true` erlaubt dem Schatzmeister Korrekturen in CLOSED/AUDITED (aber NICHT in LOCKED).

### Mitglieder
- Status: `ACTIVE | INACTIVE | EXEMPT | NON_MEMBER` (Gast).
- Felder u.a.: `paysBySEPA` (Einzugsermächtigung/EZ), `isExempt` (befreit), `duesAmount` (Standard 580 €).

### Mitgliedsbeitrag (Dues)
- Wird **automatisch nur für aktive, nicht befreite** Mitglieder mit `duesAmount > 0` erzeugt.
- **Fällig ab 1.7., zahlbar bis 30.9.** des Clubjahres → `dueDate = Date.UTC(startYear, 8, 30, 23,59,59)`.
- **Rechnungsversand per E-Mail** nur an Mitglieder **OHNE EZ** (`paymentMethod = EMAIL_INVOICE`)
  und nicht befreit. EZ/SEPA-Mitglieder werden automatisch abgebucht → keine Rechnung.
- Referenz-Schema: `MB-<Jahr-Label>-<rotaryMemberId|id-slice>` (z. B. `MB-2025-2026-1234`).

### Rechnungen (Invoice)
- Typ: `DUES | EXPENSE`. Status: `OPEN | PAID | REMINDED | CANCELLED`.
- `paymentMethod: SEPA | EMAIL_INVOICE`. Feld `invoiceSentAt` = Zeitpunkt Rechnungsversand.
- Soft-Cancel (Standard-DELETE → CANCELLED) vs. Hard-Delete (`?hard=1`, nur ohne Verknüpfungen).

### Buchungen (Transaction)
- Soft-Delete via `deletedAt`. Beim Löschen wird der Saldo korrekt angepasst
  (Korrektur-Flag `?correction=1` nötig in CLOSED/AUDITED Jahren).

### Bankkonto (Referenz für Rechnungen/Mahnungen)
- IBAN Standard: `AT41 2011 1310 0670 0296` (über ENV `CLUB_IBAN` überschreibbar).

---

## 4. Prisma-Datenmodelle (Übersicht)

`User`, `PasswordResetToken`, `Account`, `ClubYear`, `Category`, `Member`, `ImportBatch`,
`Attachment`, `TransactionAttachment`, `MailInbox`, `Transaction`, `Project`, `Invoice`,
`TxAllocation`, `ReminderLog`, `BudgetLine`, `CashflowEntry`, `AttendanceList`,
`AttendanceEntry`, `ArchivedYear`.

Schema: `prisma/schema.prisma`. **Migrationen laufen über `prisma db push --accept-data-loss`
im Build** — daher sind neue *nullable* Felder gefahrlos hinzufügbar.

---

## 5. Seiten (Routen unter `src/app/(app)/`)

`accounts`, `archive`, `attendance` (+ `[id]`, `new`), `belege`, `budget`, `cashflow`,
`categories`, `dashboard`, `dues`, `import`, `members` (+ `[id]`, `new`, `import`),
`projects` (+ `[id]`), `reports`, `settings/users`, `transactions` (+ `[id]`, `new`).

Öffentlich: `/login`, `/forgot-password`, `/reset-password`.

---

## 6. Wichtige API-Endpunkte (`src/app/api/`)

- **Buchungen:** `transactions` (POST create, datum-getriebene Jahreszuordnung),
  `transactions/[id]` (PATCH edit + Jahr-Reassign, DELETE soft-delete),
  `transactions/list|search`, `transactions/[id]/attachments`, `.../settle-allocations`.
- **Konten/Saldo:** `accounts/reassign-years` (Buchungen jahres-korrekt umhängen),
  `accounts/recompute-openings` (Eröffnungssalden-Kette neu), `accounts/reconcile(/apply)`.
- **Clubjahre:** `clubyears`, `clubyears/[id]` (+ `close`, `audit`, `lock`, `reopen`, `opening`,
  `export`, `import`, `archive-file`). Lock nutzt Vercel Blob (best-effort, scheitert nie an Datei).
- **Beiträge:** `dues/generate` (nur aktive; dueDate=30.9.), `dues/reconcile`,
  **`dues/send-invoices`** (Bulk-Mailversand an alle ohne EZ, idempotent).
- **Rechnungen:** `invoices/[id]` (PATCH edit / DELETE cancel|hard), `.../markPaid`, `.../remind`,
  `.../reopen`, **`.../send-invoice`** (Einzel-Mailversand).
- **Mitglieder:** `members` (POST), `members/[id]` (PATCH / DELETE archive|hard), `members/import`.
- **Import:** `import/george` (Excel/JSON, Erste/George), `import/sepa` (PDF).
- **E-Mail-Inbox:** `inbox/postmark` (Webhook), `mail-inbox/[id]/assign|body|dismiss`.
- **Auth/Passwort:** `auth/[...nextauth]`, `password/forgot`, `password/reset`.
- **Sonstiges:** `attendance/*` (Anwesenheit + Rechnungserzeugung), `projects/*`, `budget/*`,
  `cashflow/*` (inkl. `daily-balance` für Vermögenskurve), `categories/*`, `reports/treasurer`
  (PDF/PPTX/XLSX), `reports/details`, `users/*`, `attachments/*`, `archive/upload`, `version`.

---

## 7. Wichtige Libs (`src/lib/`)

| Datei | Zweck |
|-------|-------|
| `clubYearLifecycle.ts` | `clubYearBoundsForDate`, `ensureClubYearForDate`, `checkClubYearMutable` |
| `recomputeOpenings.ts` | Eröffnungssaldo-Übernahme-Kette neu berechnen (dryRun) |
| `runningBalance.ts` | Laufender Saldo |
| `balanceAudit.ts` | Saldo-Prüfung |
| `dataAccess.ts` | `getCurrentClubYear` u.a. Daten-Helfer |
| `email.ts` | Postmark Outbound (`sendMail`, `isEmailConfigured`, `baseUrlFrom`) |
| `duesEmail.ts` | Baut die Beitrags-Rechnungs-E-Mail (branded HTML + Text) |
| `blobStorage.ts` | Vercel Blob Upload/Fetch |
| `bankImport.ts`, `csvParse.ts`, `sepaPdfParse.ts`, `invoiceExtract.ts` | Bank-/Beleg-Import |
| `mailMatch.ts` | Zuordnung eingehender Mails/Belege |
| `earExcel.ts`, `treasurerReport.ts` | EAR-Excel / Schatzmeister-Bericht |
| `memberRosterParse.ts` | Mitglieder-Import parsen |
| `passwordReset.ts` | Reset-Token-Erzeugung/-Prüfung |
| `auth.ts` | NextAuth-Optionen, `isTreasurer` (Schatzmeister + Auditor) |
| `format.ts` | `formatEUR`, `formatDate` |

---

## 8. Environment-Variablen (in Vercel setzen)

| Variable | Zweck | Pflicht |
|----------|-------|---------|
| `DATABASE_URL` | Neon Postgres Connection String | ✅ |
| `NEXTAUTH_URL` | Basis-URL für Links (z. B. https://rotary-finanzen.vercel.app) | ✅ |
| `NEXTAUTH_SECRET` | NextAuth Session-Secret | ✅ |
| `POSTMARK_SERVER_TOKEN` | Outbound-Mail (Beitrag/Mahnung/Passwort-Reset) | für Mailversand |
| `EMAIL_FROM` | Verifizierte Absenderadresse — aktuell `malberg@schelhammer.at` | für Mailversand |
| `POSTMARK_INBOUND_TOKEN` / `_USER` / `_PASSWORD` | Inbound-Webhook-Schutz | für Beleg-Inbox |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (Archiv-Dateien, Anhänge) | für Datei-Downloads |
| `CLUB_IBAN` | Überschreibt Standard-IBAN in Rechnungs-Mails | optional |
| `OPENAI_API_KEY` / `OPENAI_MAPPING_MODEL` | KI-Fallback beim Bankimport-Mapping | optional |

---

## 9. Deploy-/Verifikations-Workflow

```bash
# lokal im Projektordner
npx tsc --noEmit                      # Typecheck
BUILD_DIR=.next-build npx next build  # Prod-Build (nutzt separaten Build-Ordner)
git add -A && git commit -m "..."
git push origin HEAD:main             # löst Vercel Auto-Deploy aus

# Deploy prüfen (Commit-Hash abgleichen)
curl https://rotary-finanzen.vercel.app/api/version
```

Auth-Check der Endpunkte: unauth POST → **403**, geschützte Seite → **307** Redirect (Login).

---

## 10. Zuletzt umgesetzte Arbeiten (chronologisch, neueste zuerst)

1. **`5b62942`** — Beitrag: Fälligkeit **30.9.**; **Rechnungsversand per E-Mail** an alle ohne EZ
   (Bulk `dues/send-invoices` + Einzel `invoices/[id]/send-invoice`); `invoiceSentAt`-Feld;
   `duesEmail.ts` Helper; Buttons „Rechnungen versenden" (DuesActions) + „Rechnung" (DuesRowActions).
2. **`d759334`** — Mitgliederliste **bearbeitbar inkl. Löschen/Archivieren**
   (`MemberRowActions`); Forderungen **PATCH/DELETE** (`invoices/[id]`); Beitragslauf
   nur aktive Mitglieder; DuesRowActions Inline-Edit (Betrag/Fälligkeit/Methode).
3. **`04c9b36`** — Kontostand-Reparatur: `recomputeOpenings` + UI-Schritt 2 auf `/accounts`.
4. **`c38442e`** — Fix Jahreswechsel-Zuordnung, Fixieren-500 (Vercel Blob), Storno-Saldo;
   Reparatur-Tool `accounts/reassign-years` + `ReassignYearsTool`.
5. **`9618333`** — Lock: Archiv-Upload best-effort → Fixieren scheitert nie mehr an der Datei.
6. **`02ec10b`** — Rotarisches Jahr (1.7.–30.6.) korrekt zuordnen; Lock-500-Fix; Storno-Saldo.
7. **`d7f3094` / `1b27973`** — Self-Service Passwort-Reset (Postmark) + Benutzerverwaltung-Fixes.
8. Früher: Postgres-Migration, Inline-Edit Buchungen, SEPA-Sync, Beleg-Workflow (Postmark inbound),
   Auditor-Rolle, Schatzmeister-Bericht (PDF/PPTX/XLSX), George Excel/JSON-Import,
   tägliche Vermögenskurve, Performance-Indizes.

---

## 11. Bekannte offene Punkte / To-dos

- [ ] **Kontostand per 30.6.2026 prüfen:** User meldete Abweichung. Reparatur-Tools liegen auf
      `/accounts` bereit: (1) *Jahre neu zuordnen* (`reassign-years`) + (2) *Eröffnungssalden neu
      berechnen* (`recompute-openings`). Beide mit **Vorschau (dryRun)**. Ursache noch nicht final
      verifiziert (Live-Daten waren nicht auslesbar). **Nächster Schritt:** Vorschau ausführen bzw.
      konkrete Zahlen einholen.
- [ ] **E-Mail-Versand-ENV verifizieren:** `POSTMARK_SERVER_TOKEN` + `EMAIL_FROM` in Vercel gesetzt?
      Sonst meldet der Rechnungsversand „E-Mail-Versand ist nicht konfiguriert".
- [ ] **`BLOB_READ_WRITE_TOKEN` verifizieren** für Archiv-Datei-Downloads.
- [ ] **Optional:** Rechnung als **PDF-Anhang** statt reiner E-Mail (aktuell HTML-Mail mit
      Bankdaten). Erfordert PDF-Generierung (pdfkit bereits im Projekt für Berichte vorhanden).
- [ ] **Optional:** Automatischer/terminierter Rechnungsversand zum 1.7. (aktuell manuell per Button).

## 12. ⚠️ Sicherheitshinweis (WICHTIG)

In früheren Chats wurde ein **GitHub Personal Access Token im Klartext** geteilt
(`ghp_...`). Dieser Token wurde zum Pushen verwendet und **sollte umgehend widerrufen**
werden (GitHub → Settings → Developer settings → Personal access tokens → revoke).
Für zukünftige Pushes einen neuen, eng begrenzten Token verwenden und niemals im Chat teilen.

---

## 13. Schnellstart im neuen Window

1. Repo klonen: `git clone https://github.com/TunoMalberg/Rotary-Finanzen.git`
2. `npm install` (bzw. bun/pnpm laut lockfile).
3. `.env` mit `DATABASE_URL` (Neon), `NEXTAUTH_URL`, `NEXTAUTH_SECRET` befüllen
   (lokal ohne echte DB nur eingeschränkt lauffähig — SQLite-Platzhalter).
4. `npx prisma generate` → `npx tsc --noEmit` → `BUILD_DIR=.next-build npx next build`.
5. Änderungen committen und auf `main` pushen → Vercel deployt automatisch.
6. Deploy via `/api/version` verifizieren.

> Dieses Dokument bei größeren Änderungen aktualisieren, damit es der aktuelle
> „Single Source of Truth"-Kontext für Übergaben bleibt.