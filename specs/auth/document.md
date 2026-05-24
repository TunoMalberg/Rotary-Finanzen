# Auth & Rollen

## Overview
Login per E-Mail/Passwort. Zwei produktive Rollen: `treasurer` (Schreibrecht) und `president` (Read-only). Optionale `admin`-Rolle für Userverwaltung.

## Goals
- Sichere Authentifizierung (NextAuth Credentials, bcrypt-Hash).
- Rollen-basierte Autorisierung in Server Components, API-Routen und UI.
- Schatzmeister kann weitere Benutzer (Präsidenten) per UI anlegen.

## Scope / Non-goals
- Out: SSO, OAuth, MFA. (Phase 2)

## User flows
1. Schatzmeister bekommt Demo-Zugang `treasurer@wien-donau.at` / `Treasurer!2025` (per Seed).
2. Login → Redirect `/dashboard`.
3. Schatzmeister legt unter `/settings/users` neue Präsidenten an.

## Functional requirements
- `requireRole('treasurer')` auf allen Mutationen.
- `useSession()` Hook gibt `role` zurück; UI verbirgt Aktionen für non-treasurer.

## Data model
`User { id, email (unique), name, role enum, passwordHash, createdAt }`

## API
- `POST /api/auth/...nextauth` (NextAuth)
- `POST /api/users` (treasurer) – legt Benutzer an

## Acceptance
- Login/Logout funktioniert.
- Präsident sieht keine "Neu"/"Bearbeiten"-Buttons.
- API antwortet 403 ohne Treasurer-Rolle.

## Test cases
- Login mit falschem Passwort → Fehler.
- Login als president, Aufruf `POST /api/transactions` → 403.

## Implementation notes
- bcryptjs (kein native build).
- Default-Seed:
  - `treasurer@wien-donau.at` / `Treasurer!2025`
  - `praesident@wien-donau.at` / `President!2025`

## Status: done (specs)