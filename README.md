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
- **PostgreSQL** + Prisma 6 (Production: Vercel Postgres / Neon)
- NextAuth (Credentials, bcrypt)

## Lokales Setup
1. Eigene Postgres-Instanz starten (z. B. lokal via Docker, oder ein Neon-Dev-Branch)
2. `.env` aus `.env.example` ableiten und ausfüllen
3. Schema und Seed:
```bash
bun install
bun run db:push     # legt Tabellen an
bun run db:seed     # Users + Stammdaten + (falls Excel-Files in /uploads vorhanden) historische Buchungen
bun run dev
```

## Production-Deploy (Vercel)
1. **Vercel Postgres** (Neon) im Storage-Tab anlegen, an das Projekt connecten.
   Damit werden `DATABASE_URL` und `POSTGRES_URL_NON_POOLING` automatisch gesetzt.
2. **NEXTAUTH_SECRET** und **NEXTAUTH_URL** als Env-Vars für Production setzen
   (`openssl rand -base64 32` für den Secret).
3. Deploy: Der Build-Script ruft `prisma generate && prisma db push` auf, das Schema
   wird automatisch angelegt/aktualisiert.
4. **Erst-Seed in der frischen Production-DB** (einmalig, lokal ausgeführt):
   ```bash
   DATABASE_URL="<vercel-postgres-pooler-url>" \
   POSTGRES_URL_NON_POOLING="<vercel-postgres-direct-url>" \
   bun run db:seed
   ```
   Lege dafür die Excel-Files (`EAR Rotary Wien Donau …xlsx`) in `/workspace/uploads/`
   ab, damit auch historische Transaktionen mitkommen.

## Demo-Logins
- Schatzmeister: `treasurer@wien-donau.at` / `Treasurer!2025`
- Präsident: `praesident@wien-donau.at` / `President!2025`

## Clubjahr
1.7. bis 30.6. (rotarisches Jahr).

## Datenbank-Reset (lokal)
```bash
bun run db:push --force-reset
bun run db:seed
```
