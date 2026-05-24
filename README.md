# Rotary Club Wien-Donau – Finanz-App

Webbasierte Finanzbuchhaltung für den Rotary Club Wien-Donau.

## Features
- **Zwei Bankkonten:** Hauptkonto + Global-Grant Treuhandkonto
- **Bank-Import:** George/Erste Bank CSV-Umsätze
- **Manuelle Buchungen** mit Beleg-Anhang (PDF, .eml, etc.)
- **Mitgliederverwaltung** + Excel-Import
- **Mitgliedsbeiträge:** SEPA-Einzug oder E-Mail-Rechnung
- **Mahnwesen** mit drei Mahnstufen
- **Auslagen-Verrechnung** über Teilnahmelisten
- **Budget** je Clubjahr mit Soll-/Ist-Vergleich
- **Liquiditätsplanung** mit Saldo-Prognose
- **Vergleichscharts** über mehrere Clubjahre
- **Archiv** historischer Clubjahre via Excel-Upload
- **Rollen:** Schatzmeister (CRUD) + Präsident (Read-only)

## Tech-Stack
- Next.js 15, React, TypeScript
- Tailwind CSS, shadcn/ui, Recharts
- SQLite + Prisma 6 (für Produktion: Postgres möglich)
- NextAuth (Credentials, bcrypt)

## Setup
```bash
bun install
bunx prisma db push
bunx tsx prisma/seed.ts
bun run dev
```

## Demo-Logins
- Schatzmeister: `treasurer@wien-donau.at` / `Treasurer!2025`
- Präsident: `praesident@wien-donau.at` / `President!2025`

## Clubjahr
1.8. bis 31.7. (rotarisches Jahr).

## Datenbank-Reset
```bash
rm prisma/dev.db && bunx prisma db push && bunx tsx prisma/seed.ts
```
