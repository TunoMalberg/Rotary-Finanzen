# Clubjahr-Lebenszyklus: Buchungen → Abschluss → Prüfung → Fixierung & Archiv

## Overview
Buchungen werden ausschließlich im laufenden Clubjahr (1.7.–30.6.) erfasst. Nach dem 30.6. schließt der Schatzmeister das Jahr für die Buchhaltung ab; die Rechnungsprüfer setzen ihren Prüfvermerk; rund 6 Monate später (Mitgliederversammlung im Herbst/Winter) wird das Jahr endgültig fixiert. Ab diesem Zeitpunkt ist das Jahr ausschließlich lesbar und steht als finale EAR-Excel-Datei im Archiv. Ab 1.7. läuft automatisch das nächste Clubjahr; das Budget für das neue Jahr wird in der Mitgliederversammlung im Juni davor beschlossen.

## Goals
- Strikte Trennung „bearbeitbar" vs. „archiviert".
- Soll/Ist-Vergleich jederzeit (laufend & nach Abschluss).
- 1:1-Excel-Export im historischen EAR-Format (kompatibel zu „EAR Rotary Wien Donau …xlsx").
- Excel-Re-Import zur Korrektur (Schatzmeister kann Tippfehler etc. direkt im Excel ausbessern).
- Finales Archiv-Excel beim Lock-Vorgang automatisch erzeugt.

## Scope / non-goals
- Keine automatische E-Mail-Benachrichtigung der Rechnungsprüfer (manuell).
- Keine PDF-Erzeugung (Excel reicht und entspricht der bisherigen Praxis).

## Lebenszyklus-Modell
```
OPEN → CLOSED → AUDITED → LOCKED
```
| Status | Voraussetzung | Buchungen änderbar | Excel-Re-Import | Bank-Import |
| --- | --- | --- | --- | --- |
| OPEN | aktiv im Zeitraum 1.7.–30.6. | ja (Schatzmeister) | ja | ja |
| CLOSED | Schatzmeister hat „Jahr abschließen" geklickt | ja (Schatzmeister, Korrektur) | ja | nein, eigentlich nicht (laufende Korrektur per Excel) |
| AUDITED | Rechnungsprüfer haben Prüfvermerk erteilt | ja (Schatzmeister, dokumentierte Korrektur) | ja | nein |
| LOCKED | Mitgliederversammlung beschließt; Archiv-XLSX erzeugt | **nein** | **nein** | nein |

## User flows
1. **Während des Jahres** – Schatzmeister bucht im laufenden Jahr (manuell oder via Bank-Import). Jederzeit Soll/Ist im Dashboard und unter `/budget` sichtbar.
2. **Stichtag 30.6.** – Schatzmeister erzeugt EAR-Excel-Export (`/api/clubyears/:id/export`), Rechnungsprüfer erhalten die Datei.
3. **Korrektur durch Excel** – Rechnungsprüfer/Schatzmeister korrigieren in Excel (Spaltenzuordnung, Buchungstexte). Die Datei wird über „Excel-Korrektur importieren" wieder hochgeladen; das System gleicht ab und zeigt Vorschau (Updates / Neue / fehlende Zeilen).
4. **Prüfvermerk** – nach Abnahme: `POST /api/clubyears/:id/audit` setzt `auditedAt`.
5. **Mitgliederversammlung (~Dez./Jän.)** – `POST /api/clubyears/:id/lock` setzt `lockedAt`, generiert finales Archiv-Excel unter `uploads/archive/EAR Rotary Wien Donau YYYY-YYYY (Archiv).xlsx` und befüllt `ArchivedYear.fileName`.
6. **Neues Jahr** – Auto-Erkennung: `getCurrentClubYear()` springt am 1.7. auf das neue Jahr (sofern angelegt). Budget wurde in MV im Juni beschlossen → bereits gepflegt.

## Data model
`ClubYear` erweitert um:
- `closedAt: DateTime?`, `closedById: String?`
- `auditedAt: DateTime?`, `auditedById: String?`, `auditNotes: String?`
- `lockedAt: DateTime?`, `lockedById: String?`

`ArchivedYear.fileName` enthält den relativen Pfad unterhalb von `uploads/`.

## API contracts
- `GET  /api/clubyears/:id/export` → 200 (.xlsx Blob im EAR-Format, Sheets `Deckblatt`, `ERSTE Konto`, `ERSTE Global Grant`, `Abschluß`, `Budget Neu`)
- `POST /api/clubyears/:id/import` (multipart `file`, `mode=preview|commit`, `deleteMissing=true|false`)
- `POST /api/clubyears/:id/close` → setzt `isClosed`, `closedAt`, übernimmt Endsalden ans Folgejahr.
- `POST /api/clubyears/:id/audit` Body: `{ notes?, undo? }` → setzt `auditedAt`/`auditedById`/`auditNotes`.
- `POST /api/clubyears/:id/lock`  → setzt `lockedAt`, generiert Archiv-XLSX.
- `POST /api/clubyears/:id/reopen` Body: `{ stage: "AUDITED" | "CLOSED" }` → Lifecycle-Rücknahme (nur solange nicht LOCKED).
- `GET  /api/clubyears/:id/archive-file` → liefert die beim Lock erzeugte Excel-Datei.

## Sicherheits- / Guard-Logik
`src/lib/clubYearLifecycle.ts#checkClubYearMutable` wird in folgenden Stellen geprüft:
- `POST /api/transactions`
- `PATCH /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `POST /api/import/george` – verbietet Bank-Import in fixierte Jahre
- `POST /api/clubyears/:id/import` – verbietet Korrektur-Import in fixierte Jahre

## Excel-Format-Mapping
- Hauptkonto-Sheet `ERSTE Konto`:
  Spalten `Mit´beitrag · A.gebühr · RYLA · Spenden · Zinsen · Sonstiges` (Einnahmen) +
  `Distrikt · Rotary Intl. · Spesen · RYLA · Spenden · Saalmiete · Sonstiges` (Ausgaben) + KONTO + Anmerkung.
  - Spalte `Anmerkung` enthält die `Transaction.id` (Round-trip-stabil).
- Global-Grant-Sheet `ERSTE Global Grant`: analog, andere Spaltenreihenfolge.
- `Abschluß`: Soll/Ist-Vergleich nach Kategorie + Bilanz.
- `Budget Neu`: Budgetvoranschlag.

## Acceptance criteria
- [x] Schema-Felder `closedAt/auditedAt/lockedAt` migriert.
- [x] Buchungs-API blockt LOCKED-Jahre.
- [x] EAR-Excel-Export liefert alle 5 Sheets im Originalformat.
- [x] Roundtrip Export → Re-Import preview ist bei stabilen Daten ≤1 % Änderungen.
- [x] Lock erzeugt Archiv-Datei in `uploads/archive/`.
- [x] Archiv-Seite zeigt alle Lifecycle-Aktionen je nach Status.
- [x] Soll/Ist-Widget auf Dashboard sichtbar.

## Fix (Juli 2026): Jahreswechsel, Fixieren-500, Storno-Saldo
Nach dem ersten realen Jahreswechsel (30.6.) traten vier Punkte auf, die hier behoben wurden:

1. **Buchungen folgen strikt dem Datum (1.7.–30.6.).**
   `src/lib/clubYearLifecycle.ts` erhielt `clubYearBoundsForDate(date)` (reine Berechnung: Monat ≥ Juli → Jahr Y/Y+1) und `ensureClubYearForDate(date)` (liefert bzw. legt das Zieljahr an, mit Eröffnungssaldo-Übernahme aus dem Vorjahr). Anlegen (`POST /api/transactions`), Bearbeiten (`PATCH /api/transactions/:id`) und Bank-Import (`/api/import/george`) bestimmen das Clubjahr jetzt ausschließlich aus dem Buchungsdatum. Juli-Buchungen landen automatisch im neuen Jahr.
2. **Jahr beim Bearbeiten änderbar.** Das Bearbeiten-Formular (`TxForm`) synchronisiert die Clubjahr-Auswahl mit dem Datum und sendet `allowCorrection: true`; der PATCH-Endpunkt bucht bei geändertem Datum/Jahr in das Zieljahr um (mit Lifecycle-Prüfung auf dem Zieljahr). Fehlermeldungen werden jetzt im Klartext angezeigt.
3. **Fixieren-500 behoben.** `lock/route.ts` und `archive-file/route.ts` schrieben/lasen über `fs` nach `process.cwd()/uploads` – auf Vercel read-only ⇒ HTTP 500. Migriert auf `blobStorage.ts` (Vercel Blob). Zusätzlich ist der Archiv-Upload jetzt **best-effort**: schlägt er fehl, wird das Jahr trotzdem fixiert (kein 500 mehr).
4. **Storno passt Saldo an.** `TransactionsTable` sendet beim Löschen/Inline-Edit `?correction=1`/`allowCorrection` und prüft die Antwort. Vorher schlug ein 409 (abgeschlossenes/geprüftes Jahr) still fehl – die Buchung blieb erhalten und der Kontostand änderte sich nicht.
5. **Reparatur-Tool** für Altbestände: `POST /api/accounts/reassign-years` (+ UI `ReassignYearsTool` auf `/accounts`) ordnet vorhandene Buchungen dem datumsrichtigen Jahr zu (Vorschau/dry-run; fixierte Jahre bleiben unangetastet).

## Implementation notes
- `src/lib/earExcel.ts` enthält den Export- und Parser-Code.
- Kategorie-Mapping für Re-Import nutzt sign-abhängige Zuordnung (RYLA/Spenden/Sonstiges können sowohl Einnahmen- als auch Ausgaben-Spalte sein).
- Bei „catch-all"-Spalten (Sonstiges) wird die bestehende Kategorie der Buchung beibehalten, um Roundtrip-Stabilität zu sichern.

## Status / open questions
- **Status:** done (UI + API + Tests live).
- **Offen:** automatisches Anlegen des Folge-Clubjahres am 1.7. – derzeit manuell über „Neues Clubjahr anlegen" auf der Archiv-Seite.