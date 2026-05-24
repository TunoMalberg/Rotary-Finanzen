# Mitgliederverwaltung

## Overview
Stammdaten der Clubmitglieder. Jedes Mitglied hat optional Einzugsermächtigung (`paysBySEPA`), Steuerbefreiung (`isExempt`), Mitgliedsbeitrag (`duesAmount`).

## Goals
- CRUD für Mitglieder.
- Excel-Import (basierend auf MB-Sheet aus EAR-Datei) zum bulk-Update.
- Status: `active`, `inactive`, `exempt`.

## User flows
- `/members` Liste mit Suche, Filter (EZ ja/nein, aktiv).
- Detail-Drawer: Adresse, Telefon, Beiträge, offene Forderungen, Notizen.
- "Excel-Import" Button → Datei-Upload → Vorschau + Konflikte → Bestätigen.

## Functional requirements
- Eindeutiger Schlüssel: `rotaryMemberId` (Integer aus Rotary-System).
- Update-Strategie: bei vorhandener `rotaryMemberId` Werte überschreiben (Adresse/Tel.), Status nur ergänzen.
- Manuelle Anlage ohne `rotaryMemberId` möglich.

## Data model
```
Member {
  id          uuid PK
  rotaryMemberId Int? unique
  lastName    string
  firstName   string
  salutation  string?
  address     string?
  city        string?
  postalCode  string?
  country     string?  // 'Austria'
  email       string?
  phone       string?
  paysBySEPA  bool default false
  isExempt    bool default false
  duesAmount  Decimal default 580
  status      enum [ACTIVE, INACTIVE, EXEMPT] default ACTIVE
  joinedAt    date?
  leftAt      date?
  notes       text?
  createdAt
  updatedAt
}
```

## API
- `GET /api/members`
- `POST /api/members` (treasurer)
- `PATCH /api/members/:id` (treasurer)
- `POST /api/members/import` (Excel/MB-Format) (treasurer)

## Excel-Format
Erwartete Spalten (heuristisch erkannt anhand Header):
- `Member ID` → rotaryMemberId
- `Name` "Lastname, Firstname"
- `Address`, `City`, `Postal Code`, `Country`
- `Mobile Phone` / `Business Phone` / `Residence Phone`
- Spalte A "1" = aktiv. Spalte B `EZ` = paysBySEPA = true; `Befreit` = isExempt = true; Beträge "580" = duesAmount.

## Acceptance
- Beim Import 80 Mitglieder werden inseriert oder upsertet.
- Kein Datenverlust bei zweitem Import.

## Test cases
- Import EAR-2025-26 → 80 Members angelegt; zweiter Import → 0 neu.
- "EZ"-Mitglieder haben paysBySEPA=true.

## Implementation notes
- SheetJS (xlsx) im API-Route.
- Name parsen "Auersperg, Ferdinand" → last=Auersperg, first=Ferdinand (trim).

## Status: done