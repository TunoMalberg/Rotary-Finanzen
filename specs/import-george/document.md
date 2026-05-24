# George (Erste Bank) – Bank-Import

## Overview
Import der Umsatzdatei aus George (Erste Bank) als CSV. Wir akzeptieren das Standard-CSV (de-AT) und mappen auf `Transaction`. Duplikat-Erkennung verhindert doppelte Buchungen.

## CSV-Format (George Erste Bank, DE)
George exportiert standardmäßig `;`-separierte Datei mit BOM. Spalten (typisch):

```
Buchungsdatum;Valutadatum;Verwendungszweck;Gegenkonto;Betrag;Währung;Kategorie;Notiz
01.07.2025;01.07.2025;"...";AT41 ...;100,00;EUR;...;...
```

Unsere Erkennung ist tolerant: Spalten werden anhand Header gemappt (case-insensitive). Akzeptiert auch:
- Buchungstag, Datum, Buchung
- Buchungstext, Verwendungszweck, Text
- Auftraggeber, Empfänger, Begünstigter, Gegenpartei
- Betrag, Umsatz
- Währung, IBAN

Fallback: Wenn `Datum`+`Betrag` nicht erkennbar, Fehler "Unbekanntes Format".

Beträge: deutsches Format (`-12,34` oder `1.234,56`) → `parseFloat` nach Normalisierung (`,`→`.`, Tausenderpunkte entfernen).

## Goals
- Upload-Form: Konto auswählen, CSV-Datei hochladen.
- Vorschau: erste 50 Zeilen, Auto-Kategorisierung, Duplikat-Markierung.
- Bestätigen → speichern + Verknüpfung mit ggf. offenen Forderungen.

## Duplikat-Erkennung
Hash = (accountId, date, amount, normalize(purpose).slice(0,80)).
Bei Treffer in DB → Zeile als "Duplikat" markiert, nicht importiert.

## Mitglieds-Match
Wenn Verwendungszweck enthält "Mitgliedsbeitrag" + Member-Name (Lastname) → memberId verknüpft.
Wenn offene `Invoice` (DUES) für Mitglied existiert mit Betrag = amount → automatisch als bezahlt markieren (paidTransactionId = neuTransactionId).

## API
`POST /api/import/george` (multipart/form-data: file, accountId, clubYearId)
→ Response: `{ created: n, duplicates: m, autoMatched: k }`

## UI
`/import` Seite mit Schritt-Wizard:
1. Konto + Clubjahr wählen
2. Datei hochladen
3. Vorschau (Tabelle, Markierungen)
4. Importieren

## Acceptance
- 30+ Buchungen aus Beispiel-CSV werden korrekt importiert.
- Wiederholter Import ergibt 0 neue Buchungen.

## Test cases
- CSV mit 5 Zeilen davon 1 Duplikat → created=4, duplicates=1.
- CSV mit MGBeitrag-Zahlung Member X → Invoice OPEN→PAID.

## Implementation notes
- Server-side parsing mit eigener kleiner CSV-Funktion (kein zusätzliches Paket, oder `csv-parse` falls bereits drin).
- BOM strippen.

## Status: done