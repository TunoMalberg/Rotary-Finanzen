# Archiv historischer Jahre

## Overview
Abgeschlossene Clubjahre können archiviert werden (Zustand "geschlossen" → keine Mutationen mehr). Historische EAR-Excel-Dateien können hochgeladen werden, um Vorjahre für Vergleichscharts verfügbar zu machen.

## User flows
- `/archive` Liste der archivierten Jahre.
- "Jahr abschließen" Button setzt `ClubYear.isClosed=true` und speichert Snapshot (Summen je Kategorie) in `ArchivedYear`.
- "Excel-Upload" für historisches Jahr: Datei wählen, Jahr-Label angeben, "ERSTE Konto"+"Abschluß"-Sheets parsen.

## Data model
```
ArchivedYear {
  id, clubYearLabel string,
  closedAt, closedById,
  fileId? (Attachment),
  summaryJson Json,    // Aggregat: { income: {category: amount}, expense: {category: amount}, balance, openingBalance }
}
```

## Excel-Format-Erkennung (EAR)
- Sheet "ERSTE Konto" oder "ERSTE Global Grant": ab Header-Zeile (Spalte A "Datum") werden Buchungen gelesen. Spalten 5..16 sind Einnahme- bzw. Ausgabe-Beträge je Kategorie.
- Sheet "Abschluß": liest "EINNAHMEN"-Block + "AUSGABEN"-Block.
- Wir extrahieren Summen je Kategorie und legen Transactions-Aggregate als pseudo-Buchungen an (1 Buchung pro Kategorie+Jahr) zur Verwendung in Charts. Realistisch: speichern wir Kategorie-Summen in `summaryJson` und parallel als reale `Transaction`s mit Datum=clubYear.endsAt für Vergleichszwecke.

## API
- `POST /api/archive/upload` (file, yearLabel)
- `POST /api/clubyears/:id/close`

## Acceptance
- Upload "EAR Rotary Wien Donau 2024-25.xlsx" erzeugt Clubyear "2024/2025" + ArchivedYear mit summaryJson.
- Charts können das archivierte Jahr in Vergleichen anzeigen.

## Status: done