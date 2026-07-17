# Lokale Entwicklung & Deployment

Kurzreferenz für die Arbeit an dieser App (Übernahme auf Arbeitsrechner, Juli 2026).

## Überblick

- **Repo:** `github.com/TunoMalberg/Rotary-Finanzen` (Branch `main`)
- **Hosting:** Vercel-Projekt `rotary-finanzen` (Team *Constantin Veyder-Malberg's projects*)
- **Live-Domain:** https://rotary.veyder-malberg.com (zusätzlich `rotary-finanzen.vercel.app`)
- **Produktions-DB:** Neon Postgres (via Vercel-Neon-Integration; Env-Variablen automatisch gesetzt)
- **Stack:** Next.js 15, React 18, TypeScript, Prisma 6, NextAuth, Tailwind. Package-Manager: **Bun**.

## Deploy-Pipeline

```
lokal ändern → git commit → git push origin main → Vercel baut & deployt automatisch → live auf rotary.veyder-malberg.com
```

Vercel deployt automatisch bei jedem Push auf `main`. Der Build-Script (`package.json`) führt dabei
`prisma generate && prisma db push --accept-data-loss && next build` aus — Schema-Änderungen landen
also direkt in der **Produktions**-DB. Schema-Migrationen daher bewusst durchführen.

Deployment-Status: `https://rotary.veyder-malberg.com/api/version`.

## Lokal einrichten

```bash
bun install
bun run prisma generate
# .env anlegen (siehe .env.example) – DATABASE_URL auf eine SEPARATE Dev-DB zeigen lassen,
# NICHT auf Produktion (der Build macht db push --accept-data-loss).
bun run db:push     # Schema in die Dev-DB
bun run db:seed     # Demo-Daten
bun run dev         # http://localhost:3000
```

Demo-Logins (nur in der Dev-/Seed-DB): `treasurer@wien-donau.at` / `Treasurer!2025`,
`praesident@wien-donau.at` / `President!2025`.

## Dev-Datenbank

Für lokale Entwicklung eine **eigene** DB verwenden (nicht Produktion). Empfehlung:
**Neon-Dev-Branch** der Produktions-DB — gleiche Engine, isolierte Daten, kostenlos, sofort erstellbar
im Neon-Konsolen-Branch der bestehenden Neon-Instanz. Connection-String in `.env` eintragen.

## Env-Variablen (Produktion, in Vercel gesetzt)

`DATABASE_URL`, `POSTGRES_URL_NON_POOLING` (Neon), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
(= `https://rotary.veyder-malberg.com`), `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`,
`POSTMARK_INBOUND_TOKEN`. `NEXTAUTH_URL` bestimmt die Basis-URL für Links in E-Mails.
