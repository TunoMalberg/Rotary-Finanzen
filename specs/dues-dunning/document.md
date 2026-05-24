# Mitgliedsbeiträge, Forderungen & Mahnwesen

## Overview
Pro Clubjahr werden den Mitgliedern Beiträge vorgeschrieben. Mitglieder mit Einzugsermächtigung (`paysBySEPA=true`) werden eingezogen (Status SEPA). Mitglieder ohne EZ erhalten eine Rechnung per E-Mail (Status `EMAIL_INVOICE`). Solange der Bank-Eingang nicht erfolgt ist, bleibt die Forderung `OPEN`. Mahnstufen 1–3 + manuell.

## User flows
- `/dues` → Übersicht aktuelles Clubjahr: Tabelle pro Mitglied (Beitrag, Methode, Status, Mahnstufe, letztes Mahndatum).
- "Beiträge generieren" → erzeugt für alle aktiven, nicht-exempt Mitglieder eine Invoice (idempotent: nicht doppelt).
- "Mahnung senden" → öffnet vorausgefüllten `mailto:`-Link; loggt ReminderLog + setzt `reminderLevel++`.
- Bank-Import matcht offene Forderungen automatisch (Betrag + Mitglied-Match).
- Manuell: "Als bezahlt markieren" verlinkt eine vorhandene Buchung.

## Functional requirements
- `Invoice.type=DUES`, `paymentMethod=SEPA|EMAIL_INVOICE`, `status=OPEN|PAID|REMINDED|CANCELLED`.
- Befreite Mitglieder (`isExempt`) erhalten **keine** Invoice.
- Mahnstufen: 1 = freundliche Erinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung mit Drohung.
- Mahn-Mail-Vorlage in Deutsch, höflich.

## Data model
```
Invoice {
  id, type [DUES, EXPENSE], memberId, clubYearId, dueDate, amount, status,
  reference,                  // z.B. "MB-2025/2026-006220331"
  description,
  paymentMethod [SEPA, EMAIL_INVOICE],
  reminderLevel int default 0,
  lastReminderAt date?,
  paidTransactionId?, paidAt?,
  createdAt, updatedAt
}
ReminderLog { id, invoiceId, sentAt, level, channel, notes }
```

## API
- `POST /api/dues/generate` (clubYearId) → erzeugt Invoices.
- `POST /api/invoices/:id/remind` → Mahn-Mail-Daten + Log.
- `POST /api/invoices/:id/markPaid` → manueller Match.

## Acceptance
- Generieren erzeugt ~80 Invoices, idempotent.
- Mahn-Klick erhöht `reminderLevel`, schreibt `ReminderLog`.

## Test cases
- 2 EZ + 1 Email-Invoice + 1 exempt → 3 Invoices.
- Bank-Import findet "MGBeitrag Auersperg" 580 EUR → matcht Invoice.

## Implementation notes
- Mahn-Mail über `mailto:?subject=&body=` (URL-encoded).
- Datum dueDate = clubYear.startsAt + 60 Tage.

## Status: done