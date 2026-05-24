# Auslagen-Verrechnung über Teilnahmelisten

## Overview
Der Club bezahlt für Veranstaltungen (z. B. MADRID-Reise, Oper, Heuriger). Die Kosten werden anteilig auf Teilnehmer verteilt. Pro Teilnehmer wird je nach EZ eingezogen oder per Email-Rechnung verrechnet. Forderung bleibt offen bis Zahlungseingang.

## User flows
- `/attendance` Liste der Veranstaltungen.
- "Neue Liste": Eventname, Datum, Gesamtkosten (info), Betrag pro Teilnehmer (oder Gesamt + Auto-Split), Methode-Default.
- Teilnehmer hinzufügen (Member-Picker) → erzeugt `AttendanceEntry`.
- "Forderungen erzeugen" → für alle Entries Invoices (type=EXPENSE).

## Data model
```
AttendanceList { id, eventName, eventDate, totalCost, billPerHead, paymentMethod, clubYearId, createdAt }
AttendanceEntry { id, listId, memberId, amount, invoiceId? }
```

## API
- `POST /api/attendance` (create list)
- `POST /api/attendance/:id/entries` (add member)
- `POST /api/attendance/:id/issue-invoices` → Invoices erzeugen (idempotent)

## UI
- Liste-Detailseite zeigt: Teilnehmer, Status (offen/bezahlt), Mahnstufen, Buttons "Mahnen", "Bezahlt markieren".

## Acceptance
- Erstellen einer Teilnahmeliste mit 5 Mitgliedern → 5 Invoices `EXPENSE`, eine pro Mitglied.

## Test cases
- Listen-Generierung idempotent.
- Bank-Import-Match auf `eventName`-Substring.

## Status: done