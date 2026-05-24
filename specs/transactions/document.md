# Konten & Buchungen

## Overview
Zwei Bankkonten (Hauptkonto, Global-Grant-Treuhand) mit Buchungen je Clubjahr (1.7.–30.6.). Manuelle Buchungen + Bank-Import. Kategorien wie EAR-Excel: Einnahmen (Mitgliedsbeiträge, Aufnahmegebühr, Spenden, RYLA, Zinsen, Sonstiges) und Ausgaben (Distrikt, Rotary Intl., Spesen, RYLA, Spenden/Clubprojekte, Präsenzaufwand, Sonstiges, Saalmiete).

## Goals
- Liste/Filter aller Buchungen pro Konto+Clubjahr.
- Manuelle Anlage / Edit / Storno (Soft-Delete).
- Saldo-Anzeige.
- Kategorisierung mit Auto-Vorschlag basierend auf "TEXT" und "CODE".

## User flows
- `/transactions` mit Filter (Konto, Clubjahr, Kategorie, Suchtext, Datum)
- "Neue Buchung" Modal: Datum, Betrag (positiv = Einnahme, negativ = Ausgabe), Kategorie (Pflicht), Gegenpartei, Verwendungszweck, optional Mitglied, Anhang.
- Klick auf Zeile → Detail-Sheet (Anhang, Notiz, Audit-Info).

## Data model
```
Account { id, name, iban, type [MAIN, GLOBAL_GRANT_TRUST] }
ClubYear { id, label '2025/2026', startsAt, endsAt, isClosed, openingBalanceMain, openingBalanceGG }
Category { id, name, kind [INCOME|EXPENSE], color, isDuesCategory bool }
Transaction {
  id, accountId, clubYearId, date, valueDate?, counterparty, purpose, code?, note?,
  amount Decimal,         // positiv = Einnahme, negativ = Ausgabe
  categoryId?, memberId?, source [IMPORT|MANUAL], importBatchId?, isReconciled bool,
  attachmentId?, createdById, createdAt, deletedAt?
}
```

## API
- `GET /api/transactions?accountId=&yearId=&q=&categoryId=`
- `POST /api/transactions`
- `PATCH /api/transactions/:id`
- `POST /api/transactions/:id/delete` (soft)
- `POST /api/transactions/:id/restore`

## Auto-Kategorisierung
Regelbasiert (case-insensitive substring match):
- "Mitgliedsbeitrag" / "MGBeitrag" / "Mitgliedsbeitrag" → "Mitgliedsbeitrag"
- "Aufnahmegebühr" → "Aufnahmegebühr"
- "RYLA" → "RYLA"
- "Spende" / "Charity" → "Spenden"
- "Distrikt" → "Distriktsbeitrag"
- "Rotary Magazin" / "Foundation" → "Rotary Intl. & Foundation"
- "Saalmiete" / "Heuriger" / "Oper" / "Konzert" / "Präsenz" → "Präsenzaufwand"
- "Kontoführung" / "Porto" / "Buchungskostenbeitrag" / "Spesen" / "KEST" / "Zinsen" → "Spesen" / "Zinsen"

## Saldo
- Saldo = openingBalance + sum(amount) per Konto/Year.
- Anzeige top der Liste.

## Acceptance
- Manuelle Buchung speichert und ändert Saldo.
- Storno setzt deletedAt; aus Saldo herausgenommen.

## Test cases
- Anlage Einnahme 580 EUR → Saldo +580.
- Storno → Saldo -580.

## Status: done