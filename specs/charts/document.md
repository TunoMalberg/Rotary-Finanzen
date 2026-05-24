# Vergleichs-Charts

## Overview
Vergleich Einnahmen-/Ausgaben-Kategorien zwischen Clubjahren. Grouped-Bar-Chart und Stacked-Area über das Clubjahr (1.7.–30.6.).

## User flows
- `/reports` Seite mit Filtern: Jahre wählen (Mehrfachauswahl), Konto-Typ.
- Charts:
  1. **Grouped Bar**: Kategorie auf X-Achse, mehrere Jahre als Balken.
  2. **Pie/Donut**: Verteilung Einnahmen vs Ausgaben aktuelles Jahr.
  3. **Trend Line**: kumulierter Saldo über Clubjahr (mehrere Jahre als Linien).
  4. **Budget vs Ist**: aktuelles Jahr.

## Tech
- Recharts (BarChart, PieChart, LineChart, AreaChart).
- Daten serverseitig aggregiert via Prisma `groupBy({categoryId})`.

## API
- `GET /api/reports/category-comparison?yearIds=...&kind=INCOME|EXPENSE`
- `GET /api/reports/balance-trend?yearIds=...`

## Acceptance
- Mit 2 Jahren (2024-25 + 2025-26) zeigt Chart 9 Kategorien als Doppelbalken.
- Werte stimmen mit DB-Summen überein.

## Status: done