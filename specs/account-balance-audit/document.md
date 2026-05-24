# Feature 12 – Konto-Saldo & Saldo-Übernahme-Audit

## Overview
Bei jeder Buchung wird der laufende Saldo des betreffenden Kontos angezeigt
("Endsaldo nach dieser Buchung"). Zusätzlich existiert ein Audit-Bereich
unter `/accounts`, der prüft, ob der Eröffnungssaldo zu Beginn jedes
rotarischen Jahres korrekt aus dem Endsaldo des Vorjahres übernommen wurde,
und Verdachts-Doppelbuchungen (Bank-Import vs. manuell) auflistet.

## Goals
- Schatzmeister sieht in den Listen sofort, **welchen Stand das Konto nach
  jeder Buchung hatte** (wie auf einem Kontoauszug). Erleichtert die
  Abstimmung mit dem Bankauszug ("Stimmt der Saldo am 15.01.?").
- Eindeutige Antwort darauf, **warum der Kontostand abweicht** (falsche
  Eröffnungssaldo-Übernahme, doppelte Buchungen, fehlende Buchungen).
- Eröffnungssalden je Clubjahr × Konto sind editierbar; bei Jahresabschluss
  wird der Eröffnungssaldo des Folgejahres automatisch aus dem berechneten
  Endsaldo des Vorjahres übernommen.

## Scope / non-goals
- **In Scope**: Anzeige laufender Saldo, Saldo-Übersicht pro Jahr, Übernahme-
  Konsistenz-Check, Editor für Eröffnungssaldo, Doppelbuchungs-Erkennung,
  One-Click-Bereinigung von Doppelungen.
- **Nicht im Scope**: Vollständige Bank-Reconciliation gegen einen
  externen Soll-Saldo (z. B. CAMT.053 Statement-Balance).

## User flows / UX / design notes
1. **Buchungsliste & Dashboard "Letzte Buchungen"**: neue Spalte **"Saldo"**
   ganz rechts. Wert = Eröffnungssaldo des Clubjahres + Σ aller Buchungen
   dieses Kontos im selben Clubjahr bis einschließlich dieser Buchung
   (chronologisch). Pro Konto separat berechnet, daher korrekt auch bei
   gemischter Anzeige Haupt + GG.
2. **Buchungs-Header**: Zwei Karten zeigen die aktuellen Endsalden Hauptkonto
   bzw. Global-Grant prominent oben.
3. **Neue Seite `/accounts` ("Konten & Saldo-Prüfung")**:
   - Pivot-Tabelle pro Clubjahr × Konto:
     Eröffnungssaldo, Bewegungen, berechneter Endsaldo, gespeicherter
     Eröffnungssaldo des Folgejahres, Status (✓ übernommen / ✗ Mismatch).
   - Inline-Editor pro Zeile (Stift-Symbol) für den Eröffnungssaldo.
   - Tabelle "Doppelbuchungs-Verdacht": Datum + Konto + Betrag +
     beide Varianten (Bank-Import / Manuell) + One-Click "bereinigen"
     (löscht die Variante ohne externalRef).
   - Hinweis-Karte erklärt die Logik.

## Functional requirements
- `computeRunningBalances({ accountIds, clubYearIds })` liefert eine
  `Map<txId, balanceAfter>` für alle Buchungen der genannten Konten/Jahre.
  Berechnung pro (Konto × Jahr) isoliert: `opening + cumsum(amount)`.
- `auditAccountBalances()` liefert pro (Jahr × Konto): Eröffnung, Summe,
  berechneter Endsaldo, gespeicherter Eröffnungssaldo des Folgejahres,
  Differenz, ok-Flag (Toleranz 0,01 €).
- Doppelungen: gleiche `(accountId, date, amount)`, mindestens eine Zeile
  mit `externalRef`, mindestens eine ohne → Verdacht.
- API `PATCH /api/clubyears/:id/opening` setzt
  `openingBalanceMain` oder `openingBalanceGG` – nur Schatzmeister/Admin.
- Jahresabschluss `POST /api/clubyears/:id/close` aktualisiert ab sofort
  zusätzlich den Eröffnungssaldo des Folgejahres auf den berechneten Endsaldo.
- Bank-Import-Duplikat-Erkennung erweitert: wenn neue Zeile `externalRef`
  hat und es existiert bereits eine Zeile mit gleichem `(accountId, date, amount)`
  ohne `externalRef`, wird die bestehende Zeile als Duplikat gewertet und
  um die Bank-Metadaten (externalRef, counterparty, valueDate) ergänzt
  (Merge statt Doppel-Anlage).

## Data model / schema
Keine Schema-Änderungen. Die Logik nutzt:
- `ClubYear.openingBalanceMain`, `ClubYear.openingBalanceGG` (existiert)
- `Transaction.externalRef` (existiert seit Bank-Import-Feature)

## API contracts
- `PATCH /api/clubyears/:id/opening`
  - Body: `{ accountType: "MAIN" | "GLOBAL_GRANT_TRUST", value: number }`
  - Auth: treasurer/admin
  - Response: `{ id, label, openingBalanceMain, openingBalanceGG }`
- `POST /api/clubyears/:id/close` (Erweiterung)
  - Setzt zusätzlich `openingBalanceMain/GG` des nächsten ClubYear
  - Response enthält `closing: { MAIN, GLOBAL_GRANT_TRUST }`

## Edge cases / failure modes
- Erstes Clubjahr: kein Folgejahr → Status "aktuelles Jahr", keine Übernahme-
  Prüfung möglich.
- Jahr ohne Buchungen: opening = closing.
- Buchung mit `deletedAt` wird NICHT in den Saldo eingerechnet.
- Bei Konflikt zwischen berechnetem Endsaldo und gespeichertem nächsten
  Eröffnungssaldo: Δ wird angezeigt; manuelle Korrektur via Editor möglich.
- Mehrfach-Aufruf von Schließen ist idempotent (überschreibt opening jedes Mal).

## Acceptance criteria
- ✓ Buchungsliste zeigt Saldo nach jeder Buchung (Hauptkonto und GG getrennt).
- ✓ `/accounts` listet alle Clubjahre und zeigt Status der Saldo-Übernahme.
- ✓ Bei Mismatch wird Δ farblich hervorgehoben (rosa).
- ✓ Doppelbuchungs-Tabelle zeigt 0 Einträge nach erfolgreicher Bereinigung.
- ✓ Editor speichert neue Eröffnungssalden persistent (Reload behält sie).

## Test plan / test cases
1. **Saldo-Spalte**: Login als Schatzmeister → /transactions öffnen →
   prüfen, dass die Saldo-Spalte rechts gefüllt ist und chronologisch
   konsistent ansteigt/abfällt.
2. **Audit ✓**: /accounts → für 2024/2025 muss "übernommen" angezeigt
   werden (Endsaldo Main = 59.838,49, gespeichertes Opening 25/26 = 59.838,49).
3. **Audit ✗ konstruieren**: Eröffnungssaldo 2025/26 z. B. auf 60.000
   ändern → 2024/25-Zeile zeigt Δ +161,51 und Status "Mismatch"; danach
   wieder auf 59.838,49 zurücksetzen → wieder "übernommen".
4. **Duplikat-Bereinigung**: alte Test-Datenbank mit vorhandenen Doppelungen
   → Liste muss diese listen → "bereinigen" entfernt die Manuelle Variante,
   Bank-Variante bleibt erhalten, Saldo nimmt um den doppelten Betrag ab.
5. **Re-Import nach Bereinigung**: Bank-Datei nochmal importieren → 0 neue
   Buchungen, Bank-Zeilen werden via externalRef-Index als Duplikat erkannt.
6. **Jahresabschluss**: ein zweites Clubjahr 2026/2027 anlegen → 2025/26
   schließen → 2026/27 muss automatisch das Opening = Endsaldo 25/26
   erhalten haben.

## Implementation notes
- Lib `src/lib/runningBalance.ts` – `computeRunningBalances` wird in
  Server-Components der Buchungs- und Dashboard-Seite aufgerufen und in
  `<TransactionsTable>` als `balanceAfter` propagiert.
- Lib `src/lib/balanceAudit.ts` – `auditAccountBalances`.
- Page `src/app/(app)/accounts/page.tsx` – Server Component.
- Client Components: `OpeningBalanceEditor.tsx`, `DuplicateResolver.tsx`.
- Sidebar-Eintrag "Konten & Saldo-Prüfung" zwischen "Buchungen" und
  "Bank-Import".

### Daten-Reparatur (einmalig)
Bei der Implementierung wurde die produktive Test-DB einmalig korrigiert:
- 2024/2025 Eröffnungssaldo gesetzt auf 61.044,50 / 17.005,58 (laut EAR).
- 2023/2024 Eröffnungssaldo per Rückrechnung auf 58.551,85 / 61.685,81 gesetzt
  (so dass closing 2023/24 = opening 2024/25 ist).
- 3 Doppelbuchungen am 21.01.2026 (Sammeleinzug 38.860 €, Aufnahmegebühr
  Fischer 506 €, Rotary Verlag −3.597 €) – jeweils Seed-Variante ohne
  externalRef gelöscht, Bank-Import-Variante mit externalRef behalten.
- Resultat: Saldo Hauptkonto 25/26 = **54.327,44 €** (vorher 90.096,44 €,
  Differenz 35.769 € entsprach den 3 Doppelungen).

## Status / open questions
- Status: **done** (2026-05-24).
- Offen: Optional könnten zukünftig importierte Bank-Statement-Balances
  (CAMT.053 / MT940) als Soll-Saldo gespeichert werden, um auch
  fehlende/verspätete Buchungen automatisch zu erkennen.