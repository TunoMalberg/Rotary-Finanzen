# Rotary Club Wien-Donau – Finanz-App – Master-Spezifikation

## Projektübersicht
Webbasierte Finanzbuchhaltungs-App für den Rotary Club Wien-Donau (Distrikt 1910). Sie ersetzt das aktuelle Excel-basierte Einnahmen-Ausgaben-Buch und bündelt Buchhaltung, Mitgliederverwaltung, Mitgliedsbeiträge, Forderungs-/Mahnwesen, Budget, Liquiditätsplanung und Archiv historischer Jahre in einer Anwendung.

## Ziele
- Vollständiger Ersatz der EAR-Excel-Dateien durch eine Web-App mit zwei Bankkonten (Hauptkonto + Global-Grant-Treuhand).
- Einfache Pflege durch den Schatzmeister; Lese-Einsicht für Präsidenten.
- Automatisierter George-/Erste-Bank-Umsatz-Import + manuelle Buchungen.
- Klares Mitgliedsbeitrags-Inkasso (SEPA-Einzug oder Rechnung per E-Mail) inkl. Mahnwesen.
- Budget pro Clubjahr + rollierende Liquiditätsplanung.
- Eingangsrechnungs-Mails werden zum Umsatz gespeichert (Audit-Trail für Rechnungsprüfer).
- Vergleichscharts der Einnahmen-/Ausgabenkategorien über mehrere Jahre.
- Archivierung abgeschlossener Clubjahre, Upload historischer Excel-Daten.

## Zielgruppe / Rollen
| Rolle | Rechte |
| --- | --- |
| `treasurer` (Schatzmeister) | Vollzugriff – CRUD auf alle Daten, Imports, Budgets, Mahnungen |
| `president` (Präsident, Past-/Elect-) | Read-only auf Dashboard, Buchungen, Mitglieder, Berichte, Charts; kein Schreibzugriff |
| `admin` | technischer Admin (Benutzerverwaltung, Reset) |

Login per E-Mail/Passwort (NextAuth Credentials Provider mit bcrypt). Initial-Schatzmeister wird beim Seed angelegt.

## Tech-Stack-Entscheidungen
- **Framework:** Next.js 14 (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui, Recharts für Charts, Framer-Motion für Akzent-Animationen
- **DB:** Postgres (NeonDB), Prisma ORM
- **Auth:** NextAuth (JWT, Credentials), Rollen via `User.role`
- **Storage (Mail-Anhänge):** lokaler Filestore unter `/public/uploads` (Dev). In Prod austauschbar.
- **Excel:** `xlsx` (SheetJS) für Import/Export
- **Bank-Import:** Erste Bank/George **CSV oder XLSX** (Standardformat siehe `specs/import-george/document.md`); Idempotenz über `Transaction.externalRef` (Buchungsreferenz) + Cutoff anhand letzter Buchung pro Konto.
- **Internationalisierung:** Deutsch (de-AT)
- **Datumsformat:** dd.MM.yyyy, Währung EUR (de-AT)
- **Clubjahr:** 1.7. – 30.6. (intern als ROTARY_YEAR_START_MONTH=7, Index 6). Laut User-Vorgabe: "endet jeweils am 30.6." → Clubjahr = 1.7.–30.6.

## Architekturregeln
- Server Components für Datenseiten, Client Components für interaktive Forms/Charts.
- Alle DB-Mutationen via Server Actions oder API-Routen mit Rollen-Guard (`requireRole('treasurer')`).
- Geld-Beträge als `Decimal(12,2)` in Prisma; in JS als string serialisiert, im UI lokalisiert.
- Jede Buchung gehört zu **genau einem** Konto (`account_id`) und **einem** Clubjahr (`club_year_id`); Kategorien sind separate Stammdaten.
- Member-IDs aus Rotary-System (z. B. 6220331) sind Pflicht-IDs für CRM-Bezug.
- "Forderung offen" bis Zahlung gematcht → Status auf `PAID`.
- Soft-Delete für Buchungen (Audit), aber Schatzmeister kann harten Storno mit Kommentar buchen.
- Eingehende E-Mails als Anhang an Buchung: gespeicherte Datei (.eml/.pdf), referenziert per `attachment_id`.

## Branding (Rotary)
- Primärfarbe: Royal Blue `#17458F`
- Sekundärfarbe: Rotary Gold `#F7A81B`
- Akzent: Cranberry `#D41367`, Sky `#0099CC`
- Schrift: "Open Sans" (Body) + "Frutiger / Source Sans 3" Fallback. Wir nutzen Google "Source Sans 3" + "Open Sans".
- Logo-Wordmark: "Rotary" + Rad-Glyphe (SVG inline). Footer: "Rotary Club Wien-Donau – Distrikt 1910"

## Feature-Liste

| # | Feature | Spec | Status |
|---|---|---|---|
| 1 | Authentifizierung & Rollen | [specs/auth/document.md](auth/document.md) | done |
| 2 | Mitgliederverwaltung + Excel-Import | [specs/members/document.md](members/document.md) | done |
| 3 | Konten (Haupt + Global Grant) & Buchungen | [specs/transactions/document.md](transactions/document.md) | done |
| 4 | George-/Erste-Bank-Import (CSV + XLSX, Cutoff + externalRef-Dedup) | [specs/import-george/document.md](import-george/document.md) | done |
| 4b | SEPA-Sammeleinzug aufteilen (PDF) + Auto-Forderungsausgleich | [specs/import-sepa/document.md](import-sepa/document.md) | done |
| 5 | Mitgliedsbeiträge, Forderungen & Mahnwesen | [specs/dues-dunning/document.md](dues-dunning/document.md) | done |
| 6 | Auslagen-Verrechnung (Teilnahmelisten) | [specs/expenses-attendance/document.md](expenses-attendance/document.md) | done |
| 6b | Auslagenprojekte – Erweiterung (Non-Member, personCount, Auto-Kategorie, Edit, Mail/Mahnen) | [specs/expenses-projects-extension/document.md](expenses-projects-extension/document.md) | in-progress |
| 7 | Budget & Liquiditätsplanung | [specs/budget-cashflow/document.md](budget-cashflow/document.md) | done |
| 8 | Eingangsrechnungs-Mails / Anhänge | [specs/inbox-attachments/document.md](inbox-attachments/document.md) | done |
| 9 | Vergleichs-Charts | [specs/charts/document.md](charts/document.md) | done |
| 10 | Archiv historischer Jahre | [specs/archive/document.md](archive/document.md) | done |
| 11 | Responsive Design (Mobile-first, iPhone Pro Max …) | [specs/responsive/document.md](responsive/document.md) | done |
| 12 | Konto-Saldo: laufender Saldo pro Buchung + Audit der Jahres-Übernahme | [specs/account-balance-audit/document.md](account-balance-audit/document.md) | done |
| 13 | Clubjahr-Lebenszyklus + EAR-Excel-Export/-Re-Import + Soll/Ist | [specs/year-lifecycle/document.md](year-lifecycle/document.md) | done |

## Datenmodell (high-level)
```
User(id, email, name, role, passwordHash)
ClubYear(id, label "2025/2026", startsAt 2025-07-01, endsAt 2026-06-30, isClosed)
Account(id, name, iban, type [MAIN|GLOBAL_GRANT_TRUST])
Category(id, name, kind [INCOME|EXPENSE], isDuesCategory, color)
Member(id, rotaryMemberId, lastName, firstName, salutation, address, city, postalCode, country,
       email, phone, paysBySEPA, isExempt, duesAmount, status, joinedAt, leftAt, notes)
Transaction(id, accountId, clubYearId, date, valueDate, counterparty, purpose, code, note,
            amount, categoryId, memberId?, source [IMPORT|MANUAL], importBatchId?, isReconciled,
            attachmentId?, createdById, createdAt, deletedAt)
ImportBatch(id, accountId, fileName, importedById, importedAt, rowCount)
Attachment(id, fileName, mimeType, sizeBytes, storagePath, uploadedById, uploadedAt, kind [INVOICE|RECEIPT|EMAIL|OTHER])
Invoice(id, type [DUES|EXPENSE], memberId, clubYearId, dueDate, amount, status [OPEN|PAID|CANCELLED|REMINDED], reference, description, paymentMethod [SEPA|EMAIL_INVOICE], reminderLevel, lastReminderAt, paidTransactionId?)
ReminderLog(id, invoiceId, sentAt, level, channel [EMAIL|MANUAL], notes)
BudgetLine(id, clubYearId, categoryId, amount, note)
CashflowEntry(id, clubYearId, date, label, amount, isPlanned)
AttendanceList(id, eventName, eventDate, totalCost, billPerHead, paymentMethod [SEPA|INVOICE])
AttendanceEntry(id, listId, memberId, amount, invoiceId?)
ArchivedYear(id, clubYearLabel, fileId, summaryJson)
```

## Akzeptanzkriterien (übergeordnet)
- Schatzmeister kann sich einloggen und ein neues Clubjahr eröffnen.
- George-Datei (CSV oder XLSX) kann hochgeladen werden, neue Buchungen werden seit der letzten vorhandenen Buchung ergänzt, Duplikate werden erkannt (über Buchungsreferenz).
- Mitgliedsbeitrag eines Mitglieds ohne EZ erscheint als offene Forderung; nach Bank-Eingang wird sie automatisch aufgelöst.
- Budget pro Clubjahr je Kategorie ist erfassbar und im Bericht sichtbar.
- Liquiditätsplanung: Tabelle der geplanten Cashflows + Liniendiagramm Saldo nach Datum.
- Vergleichschart (Bar) Einnahmen-/Ausgabenkategorien für 2 oder mehr Jahre.
- Eingangsrechnung-Mail (.eml/.pdf) kann an Buchung angehängt und im UI heruntergeladen werden.
- Mitglieder-Excel-Import aktualisiert vorhandene Mitglieder anhand `rotaryMemberId`.
- Excel-Upload eines historischen Clubjahres legt einen `ArchivedYear`-Eintrag inkl. extrahierter Buchungs-/Abschluss-Snapshots an.
- Präsident sieht alle Daten im Read-only-Modus, alle Schreibaktionen sind verborgen/deaktiviert.

## Test-Plan (übergeordnet)
- Unit: Helpers (`computeRotaryYear(date)`, `formatEUR`, `parseGeorgeCsv`)
- Integration: API `POST /api/import/george`, `POST /api/dues/run`
- E2E (manual via agent-browser): Login → Dashboard → Import → Mahnung → Charts.

## Offene Punkte
- E-Mail-Versand der Mahnungen: zunächst als generierter Mailto-Link (kein SMTP konfiguriert). User kann Mail aus dem Standard-Mailclient versenden.
- SEPA-Einzug-Datei (XML pain.008) wird out-of-scope (kann Phase 2). UI zeigt nur "EZ markiert".