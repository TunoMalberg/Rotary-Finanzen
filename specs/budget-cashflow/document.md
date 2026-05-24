# Budget & Liquiditätsplanung

## Overview
Pro Clubjahr wird ein Budget je Kategorie hinterlegt. Liquiditätsplanung: zukünftige geplante Cashflows (Soll/Haben) ergeben Saldo-Prognose über das Clubjahr.

## User flows (Budget)
- `/budget` Tabelle: Kategorie | Soll (Budget) | Ist (aktuelle Buchungen) | Δ | Δ %.
- Inline-Edit der Budgetwerte.
- "Aus Vorjahr kopieren" Button.

## User flows (Liquidität)
- `/cashflow` Tabelle der `CashflowEntry` (Datum, Label, Betrag, geplant?).
- Linien-Chart: Saldo über Datum (start = aktueller Saldo).
- Manuelle Anlage: "Spende erwartet 5000 € am 15.10."

## Data model
```
BudgetLine { id, clubYearId, categoryId, amount, note? }   // unique (clubYearId, categoryId)
CashflowEntry { id, clubYearId, date, label, amount, isPlanned bool, createdById }
```

## API
- `GET /api/budget?yearId=`
- `PUT /api/budget` (bulk upsert)
- `POST /api/budget/copy-from-prior` (treasurer)
- `GET /api/cashflow?yearId=`
- `POST /api/cashflow`

## Acceptance
- Budget und Ist werden in einer Zeile angezeigt; Abweichung farblich (rot >10% over, grün <budget).
- Liquiditätschart zeigt Saldo-Linie.

## Test cases
- Kopieren erstellt Budget-Lines auf Basis des Vorjahres.
- CashflowEntry mit Datum < heute zählt als "geplant aber überfällig".

## Status: done