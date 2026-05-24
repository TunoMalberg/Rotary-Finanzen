# George (Erste Bank) – Bank-Import

## Overview
Import der Umsatzdatei aus George (Erste Bank) als **CSV oder XLSX**. Die Datei wird auf
das Datenmodell `Transaction` gemappt. Pro Konto wird die letzte vorhandene Buchung
ermittelt; nur neuere Zeilen werden importiert (Cutoff-Logik). Duplikate werden
hauptsächlich über die Bank-eigene **Buchungsreferenz** (`externalRef`) erkannt – das
macht den Import idempotent, auch wenn überlappende Zeiträume hochgeladen werden.

## Goals
- Upload-Form: Konto + Clubjahr wählen, Datei (CSV oder XLSX) hochladen.
- Vorschau (Dry Run): erste 200 Zeilen, Auto-Kategorisierung, Status-Markierung
  (Neu / Duplikat / Älter-übersprungen) + Filter-Tabs.
- Bestätigen → speichern + Verknüpfung mit ggf. offenen Forderungen.
- Idempotenz: wiederholter Upload derselben Datei erzeugt **0 neue Buchungen**.
- Letzter Stand sichtbar: UI zeigt das Datum der letzten in der App vorhandenen Buchung.

## Unterstützte Formate

### XLSX (Erste Bank / George neuer Export, primärer Standard)
Header-Zeile beginnt mit `Buchungsdatum` und enthält typischerweise:

```
Buchungsdatum | Durchführungsdatum | Durchführungszeit | Kontoauszug / Rechnung |
Partner Name  | Partner IBAN | Partner BIC | Partner Kontonummer | Partner Bankleitzahl |
Betrag        | Währung      | Buchungs-Details |
Buchungsreferenz | Notiz | Zahlungsreferenz
```

Vor der Header-Zeile dürfen Vor-Zeilen stehen (Account-Holder, Datumsbereich) – sie
werden automatisch übersprungen.

Datums-/Zeit-Spalten kommen als Excel-Seriennummern (`46164`) und werden konvertiert.
Beträge kommen als echte Zahlen (`1740`, `-998.25`).

### CSV (George Erste Bank, klassisches Format, weiterhin unterstützt)
`;`-separiert, BOM ok, deutsches Zahlenformat (`1.234,56`). Spalten werden tolerant
über Header-Aliasse erkannt:

| Feld | Akzeptierte Header |
| --- | --- |
| Buchungsdatum | `Buchungsdatum`, `Buchungstag`, `Datum`, `Datum Buchung`, `Buchung` |
| Valuta-Datum | `Durchführungsdatum`, `Valutadatum`, `Valuta`, `Wertstellung` |
| Betrag | `Betrag`, `Umsatz`, `Wert` |
| Verwendungszweck | `Buchungs-Details`, `Verwendungszweck`, `Buchungstext`, `Text` (Fallback `Zahlungsreferenz`) |
| Gegenpartei | `Partner Name`, `Auftraggeber`, `Empfänger`, `Begünstigter`, `Gegenpartei`, `Empfänger/Auftraggeber` |
| IBAN | `Partner IBAN`, `IBAN`, `Gegenkonto` |
| Währung | `Währung`, `Currency` |
| Eindeutige Referenz | `Buchungsreferenz`, `Transaktionsreferenz`, `Referenz` |
| Kontoauszug-Nr. | `Kontoauszug / Rechnung` |

Beträge: Heuristik erkennt sowohl deutsches (`1.234,56`) als auch englisches
(`1,234.56`) Zahlenformat.

## Cutoff-Logik („nur Neues ergänzen“)
1. Aus der DB wird die **letzte vorhandene Buchung** des Kontos ermittelt
   (`max(date) where accountId=? AND deletedAt IS NULL`).
2. Alle Zeilen mit `date < lastDate` werden mit Status **„Älter – übersprungen“**
   markiert und nicht importiert (`skippedOlder`).
3. Übrige Zeilen durchlaufen die Duplikat-Prüfung.
4. Über das UI-Häkchen **„Auch Zeilen vor der letzten vorhandenen Buchung importieren“**
   (= API-Param `importAll=true`) lässt sich der Cutoff für initiale Vollimporte
   deaktivieren.

## Duplikat-Erkennung
1. **Primär**: gleiche `accountId` + gleicher `externalRef` (Bank-Buchungsreferenz).
   Da die Erste Bank pro Buchung eine garantiert eindeutige Referenz liefert
   (`201112605222XYA-00210U6GT98H`), ist das die zuverlässigste Methode.
2. **Fallback** (für Zeilen ohne Referenz oder ältere Bestandsdaten): identische
   Kombination aus `accountId` + `date` + `amount` + `purpose`.

Schema-seitig erzwungen via `@@unique([accountId, externalRef])`.

## Mitglieds-Match
Wenn `Partner Name` / Verwendungszweck den Nachnamen eines Mitglieds enthält →
`memberId` wird gesetzt. Wenn zusätzlich offene `Invoice` (Status `OPEN` oder
`REMINDED`) für genau diesen Mitglieds-Betrag existiert, wird sie automatisch auf
`PAID` gesetzt (`paidTransactionId` zeigt auf die neue Buchung).

## API
`POST /api/import/george` (multipart/form-data)

Felder:
- `file` – CSV oder XLSX (Pflicht)
- `accountId` – Ziel-Konto (Pflicht)
- `clubYearId` – Ziel-Clubjahr (Pflicht)
- `dryRun` – `"true"` → keine DB-Schreibvorgänge, nur Vorschau
- `importAll` – `"true"` → Cutoff anhand letzter Buchung deaktivieren

Response (JSON):
```json
{
  "source": "xlsx" | "csv",
  "totalRows": 89,
  "created": 83,
  "duplicates": 6,
  "skippedOlder": 0,
  "autoMatched": 5,
  "lastExistingDate": "2026-01-21T00:00:00.000Z",
  "importAll": false,
  "dryRun": false,
  "preview": [ /* PreviewRow */ ]
}
```

`PreviewRow.isSkippedOlder` markiert Zeilen, die wegen Cutoff übersprungen wurden;
`isDuplicate` für Duplikat-Treffer.

## UI (`/import`)
1. Konto + Clubjahr wählen
2. Datei hochladen (CSV oder XLSX)
3. Optional: „Auch ältere Zeilen importieren“ ankreuzen
4. Vorschau (Dry Run) → Filter-Tabs „Alle / Neu / Duplikate / Älter“
5. Importieren

Hinweis-Banner zeigt das Datum der letzten vorhandenen Buchung.

## Datenmodell
`Transaction.externalRef String?` – speichert die Bank-Buchungsreferenz.
Eindeutigkeit über `@@unique([accountId, externalRef])`.

## Acceptance
- 89 Zeilen aus Beispiel-XLSX werden korrekt geparst, 83 neue Buchungen angelegt,
  6 Duplikate erkannt (Überlappung mit Bestand), 5 Forderungen automatisch
  ausgeglichen.
- Wiederholter Import derselben Datei ergibt **0 neue Buchungen**, 87 als
  „Älter-übersprungen" + 2 als „Duplikat" markiert.
- Header-Erkennung tolerant gegen Vor-Zeilen (Account-Holder, Datumsbereich) im XLSX.

## Test cases
- XLSX 89 Zeilen, leere DB → created=89.
- XLSX 89 Zeilen, 6 Bestand auf 21.01. → created=83, duplicates=6.
- Re-Import direkt danach → created=0, duplicates=2 (auf max-date), skippedOlder=87.
- CSV mit MGBeitrag-Zahlung Member X → Invoice OPEN→PAID.
- Datei mit unbekanntem Header → 400 mit klarer Fehlermeldung incl. erkannter Header.

## Implementation notes
- `src/lib/bankImport.ts` – Format-agnostischer Parser (CSV + XLSX → `ParsedRow[]`).
- `src/app/api/import/george/route.ts` – Cutoff- + Dedup-Logik, schreibt
  `ImportBatch` und `Transaction` mit `externalRef`.
- Excel-Seriendaten via `(serial - 25569) * 86400 * 1000`.
- Beträge tolerant via `parseAnyNumber` (deutsch & englisch).
- Server-side parsing mit `xlsx` (SheetJS) – bereits Dep.

## Status: done