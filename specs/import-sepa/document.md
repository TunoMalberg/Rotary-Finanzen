# SEPA-Sammeleinzug aufteilen (PDF)

## Overview
Bei einem SEPA-Sammeleinzug erscheint im Bank-Auszug nur **eine** aggregierte
Buchung (Lastschriftsumme), die im Verwendungszweck eine bank-interne Sammlungs-
Referenz enthält (z. B. `QJMT6SX1 Mitgliedsbeitrag 24-25`). Die einzelnen
Mitglieds-Lastschriften liegen separat als George-PDF vor.

Diese Funktion liest das PDF, ordnet jede Einzel-Lastschrift einem Mitglied zu,
matcht sie gegen die offene Forderung und legt eine `TxAllocation` an. Die
Aggregat-Buchung wird damit auf einzelne Mitglieds-Anteile aufgeteilt; offene
Mitgliedsbeitrags-Forderungen werden automatisch auf `PAID` gesetzt.

## Goals
- Benutzer lädt das PDF (zusätzlich zur Bank-CSV/XLSX) hoch.
- App findet automatisch die passende Aggregat-Buchung anhand
  Lastschriftsumme + Sammlungs-Referenz.
- Pro Eintrag: Mitglied erkennen (Nachname / IBAN), offene Forderung matchen.
- Beim Bestätigen: `TxAllocation` pro Eintrag speichern, Forderung →
  `PAID` (`paidTransactionId` zeigt auf Aggregat-Buchung).
- Idempotent: erneuter Upload mit bereits aufgeteilter Buchung → 409.

## PDF-Format (George Erste Bank)
Header (Seite 1):
```
Kontoinhaber:in: Rotary Club Wien-Donau
IBAN: AT41 2011 1310 0670 0296
Name der Sammlung   QJMT6SX1 Mitgliedsbeitrag 24-25
Anzahl der Aufträge   67 Aufträge
Lastschriftsumme   38.860,00 EUR
Durchführung   20.01.2026
angefordertes Fälligkeitsdatum   21.01.2026
Creditor ID   AT74ZZZ00000038762
Status   Abgeschlossen
```

Pro Eintrag (3 Zeilen):
```
<Lastname> <Firstname [Titel]>  Rotary Mitgliedsbeitrag 7/25-6/26  580,00 EUR
<MANDATE-REF>  <PARTNER-IBAN>      (oder umgekehrt; IBAN kann fehlen)
Abgeschlossen   SEPA-Lastschrift   Ihre Lizenz   Manueller Auftrag
```

Format ist stabil; Parser ist tolerant gegen Reihenfolge IBAN/Mandate-Ref und
gegen Titel im Namen (Dr., Mag., Prof. ...). Mandate-Referenz ist
typischerweise der GROSS-geschriebene Lastname (ggf. "ROTARY" bei
inhaberidentischen Konten).

## Datenmodell

```prisma
model TxAllocation {
  id            String      @id @default(cuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  memberId      String?
  member        Member?     @relation(fields: [memberId], references: [id])
  invoiceId     String?
  invoice       Invoice?    @relation(fields: [invoiceId], references: [id])
  amount        Float
  description   String?     // "Rotary Mitgliedsbeitrag 7/25-6/26"
  partnerName   String?     // PDF-Roh-Name
  partnerIban   String?
  source        String      @default("SEPA_PDF")
  createdAt     DateTime    @default(now())
}
```

Zusätzlich:
- `Invoice.paidTransactionId` ist nicht mehr `@unique` – mehrere Forderungen
  können dieselbe Aggregat-Buchung referenzieren.
- `Transaction.invoicesPaid Invoice[]` (statt früher 1:1 `invoicePaid`).
- `Transaction.allocations TxAllocation[]`.
- `Member.iban String?` für IBAN-Match.

## Aggregat-Buchungs-Erkennung
Wenn `transactionId` nicht explizit übergeben wird:
1. Kandidaten = Buchungen auf dem gewählten Konto mit `amount = Lastschriftsumme`.
2. Wenn `Name der Sammlung` einen Code enthält (z. B. `QJMT6SX1`), bevorzugen
   wir Kandidaten mit diesem Code im `purpose`.
3. Sonst neueste Buchung gewinnt.

## Mitglieds-Erkennung pro Eintrag
1. **IBAN**: `Member.iban == partnerIban` → match (matchType `iban`).
2. **Nachname**: erstes Token aus `Partner Name` gegen `Member.lastName`.
   Bei mehreren Treffern: per Vorname disambiguieren; sonst `name-ambiguous`
   mit Hinweis (erstes ausgewählt).

## Forderungs-Match
Pro erkanntem Mitglied:
```sql
Invoice WHERE memberId = ? AND clubYearId = aggregateTx.clubYearId
        AND type = 'DUES' AND status IN ('OPEN', 'REMINDED')
        AND amount = entry.amount
```
Treffer → bei Bestätigung `status='PAID'`, `paidAt = aggregateTx.date`,
`paidTransactionId = aggregateTx.id`.

## API
`POST /api/import/sepa` (multipart/form-data)

Felder:
- `file` – PDF-Datei (Pflicht)
- `accountId` – Ziel-Konto (Pflicht)
- `transactionId` – optional (sonst Auto-Detect)
- `dryRun` – `"true"` für Vorschau

Response:
```json
{
  "dryRun": false,
  "parsed": { "collectionName": "...", "collectionRef": "...", "expectedCount": 67, "totalAmount": 38860, "executionDate": "...", "dueDate": "..." },
  "aggregateTransaction": { "id": "...", "date": "...", "amount": 38860, "purpose": "..." },
  "stats": { "totalEntries": 67, "memberMatched": 63, "unmatchedMembers": 4, "invoiceMatched": 62, "unmatchedInvoices": 1, "sum": 38860 },
  "preview": [ { "partnerName": "...", "lastName": "...", "amount": 580, "member": {...} | null, "invoice": {...} | null, "matchType": "iban|name|name-ambiguous|none", "note": null } ]
}
```

Fehler-Codes:
- 400 – PDF nicht lesbar / kein Match / Summen-Mismatch
- 404 – keine passende Aggregat-Buchung gefunden
- 409 – Buchung wurde bereits aufgeteilt (Allocations existieren schon)

## UI (`/import`, zweite Sektion)
1. Konto wählen
2. PDF hochladen
3. Vorschau – Statistik (Mitglieder-Match, Forderungs-Match, ohne Match) +
   Tabelle mit Filter-Tabs „Alle / ausgeglichen / offen"
4. „Aufteilen & Forderungen ausgleichen" → schreibt Allocations + setzt
   Invoices auf PAID

Auf der Buchungs-Detailseite werden Allocations als Sub-Tabelle angezeigt.

## Acceptance
- 67 Einträge aus Beispiel-PDF werden erkannt; Summe = 38.860 EUR =
  Buchungsbetrag.
- 63 von 67 Mitgliedern werden anhand Nachname/IBAN erkannt; 4 unbekannt
  (z. B. tippfehlerhafte Einträge oder Nicht-Mitglieder).
- 62 offene SEPA-Forderungen 2025/2026 werden auf `PAID` gesetzt.
- Buchungs-Detail zeigt 67 Aufteilungen + Summe.
- Erneuter Upload derselben Datei → 409 (bereits aufgeteilt).

## Test cases
- Upload PDF + dryRun=true → status 200, parsed/stats korrekt, keine
  DB-Schreibvorgänge.
- Upload PDF + dryRun=false → 67 Allocations + 62 Invoices PAID.
- Erneuter Upload → 409.
- Aggregat-Buchung manuell per `transactionId` setzen → bevorzugt diese.
- PDF mit Summen-Mismatch zur Buchung → 400 mit Hinweis.

## Implementation notes
- PDF-Parsing serverseitig mit `pdfjs-dist` (legacy build, läuft im Node-
  Kontext). `pdfjs-dist` ist als `serverExternalPackages` in `next.config.js`
  eingetragen, damit der Worker zur Laufzeit aus `node_modules` geladen wird.
- Lines werden über Y-Koordinate gruppiert, dann mit Regex pro Eintrag geparst.
- `parseGermanNumber` für "1.234,56"-Format.
- Schreib-Operation in einer einzigen `prisma.$transaction` für Atomarität.

## Status: done