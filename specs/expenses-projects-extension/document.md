# Auslagenprojekte – Erweiterung Teilnahmelisten

## Overview

Bei Veranstaltungen / Ausflügen zahlt der Club die Kosten vor und holt sie
anschließend von den Teilnehmern zurück. Die bestehende Teilnahmeliste
(`AttendanceList`) wird hierfür ausgebaut zu einem vollwertigen
**Auslagenprojekt** mit folgenden zusätzlichen Fähigkeiten:

- Nichtmitglieder als Teilnehmer (in Mitgliederdatei mit Status `NON_MEMBER`,
  später konvertierbar in echte Mitglieder).
- Pro Mitglied / Nichtmitglied eine **Personenzahl** (Gast bringt z. B. 4
  Personen mit) → Forderungsbetrag = `personCount × billPerHead`.
- Pro Auslagenprojekt automatisch eine eigene **Kategorie** (für Buchungs-
  Zuordnung; auch spätere Rechnungen für dieses Projekt landen hier).
- Liste, Teilnehmer und Personenzahl **nachträglich editierbar**.
- **Mail-Forderung** (mailto: mit Entwurf) für Teilnehmer ohne
  Einzugsermächtigung.
- **Status-Anzeige** offen / gemahnt / bezahlt pro Forderung; Sammel-Einzug
  via SEPA-PDF-Import löst die einzelnen Forderungen automatisch aus.
- **Mahn-Mails** für noch offene Forderungen.

## Goals

1. Ein Auslagenprojekt anlegen, bearbeiten und löschen können.
2. Teilnehmer (Mitglied + Nichtmitglied) hinzufügen, Personenzahl pflegen.
3. Forderungen je Teilnehmer per Mail oder per Einzug abwickeln.
4. Eingegangene Zahlungen / Sammeleinzüge automatisch der jeweiligen
   Forderung zuordnen.

## Scope / non-goals

- Kein direkter SMTP-Versand – Mails werden über `mailto:`-Links erzeugt
  (gleiches Pattern wie Mitgliedsbeitrags-Mahnungen).
- Keine Mehrwährung, keine Steuerberechnung.
- Editieren bleibt auf Treasurer/Admin im aktuellen Clubjahr beschränkt
  (gleiche Guard wie bei Buchungen).

## User flows

### Liste anlegen
1. `/attendance/new` → Eventname, Datum, Beschreibung, Betrag/Person,
   Methode (SEPA / Rechnung / Mix).
2. Mitglieder per Checkbox auswählen, optional Personenzahl > 1 pflegen.
3. "Nichtmitglied hinzufügen" → Inline-Formular Vorname / Nachname /
   E-Mail / IBAN / EZ / Personenzahl. Beim Speichern wird ein
   `Member`-Datensatz mit `status="NON_MEMBER"` erzeugt.
4. Speichern → Projekt + Kategorie (`kind=EXPENSE`, scope=Clubjahr) +
   Teilnehmerzeilen (Beträge automatisch berechnet).

### Liste bearbeiten (Detail-Seite)
- Header inline editierbar (Eventname, Datum, Beschreibung, Betrag/Person,
  Methode). "Speichern" recomputed alle offenen Forderungs-Beträge.
- Pro Teilnehmerzeile: Personenzahl + Betrag + Methode-Override editierbar,
  Zeile löschbar (Warnung wenn schon Invoice existiert).
- "Teilnehmer hinzufügen" jederzeit möglich (Mitglied-Picker oder Inline-
  Nichtmitglied-Form).
- "Forderungen erzeugen" → für alle Zeilen ohne Invoice eine `Invoice`
  (`type=EXPENSE`, paymentMethod gemäss Override / Member.paysBySEPA /
  Liste-Default).

### Forderung an Teilnehmer
- Pro offene Zeile: Button "Mail" → öffnet Mail-Client mit fertigem
  Forderungsentwurf (Betrag, Verwendungszweck = Reference, IBAN).
- Button "Mahnen" → erhöht `reminderLevel`, schreibt `ReminderLog`,
  öffnet Mail-Client mit Mahnentwurf.
- Button "Bezahlt" → Invoice manuell auf PAID setzen.

### Sammel-Einzug
- Bestehender SEPA-PDF-Importer (`/api/import/sepa`) wird leicht erweitert,
  damit auch `EXPENSE`-Forderungen erkannt und ausgelöst werden:
  Match nach `memberId + amount + clubYearId`, beliebiger `type`.
- Beim Anwenden bekommt die aggregierte Bank-Buchung automatisch die
  Kategorie des Auslagenprojekts (sofern alle Forderungen aus genau einem
  Projekt stammen).

## Data model

```prisma
model AttendanceList {
  id            String   @id
  eventName     String
  eventDate     DateTime
  description   String?           // NEU
  totalCost     Float?
  billPerHead   Float
  paymentMethod String              // SEPA | EMAIL_INVOICE | MIXED
  clubYearId    String
  clubYear      ClubYear
  categoryId    String?            // NEU – verlinkte Auto-Kategorie
  category      Category?          // NEU
  entries       AttendanceEntry[]
  createdAt     DateTime
}

model AttendanceEntry {
  id             String   @id
  listId         String
  list           AttendanceList
  memberId       String
  member         Member
  personCount    Int     @default(1)   // NEU
  amount         Float                 // = personCount * billPerHead (oder Override)
  paymentOverride String?              // NEU – pro Zeile abweichende Methode
  invoiceId      String?
  invoice        Invoice?
}

model Member {
  // existing
  status         String   // ACTIVE | INACTIVE | EXEMPT | NON_MEMBER  ← Wert hinzu
}
```

## API contracts

| Methode | Pfad | Zweck |
|---|---|---|
| POST   | `/api/attendance` | Liste anlegen, Auto-Kategorie, Entries inkl. personCount + non-member |
| PATCH  | `/api/attendance/[id]` | Header & Default-Felder ändern (recompute) |
| DELETE | `/api/attendance/[id]` | Liste + Entries löschen (nur wenn keine Forderungen aktiv / oder Cascade mit Hinweis) |
| POST   | `/api/attendance/[id]/entries` | Entry hinzufügen (member oder neuer non-member) |
| PATCH  | `/api/attendance/[id]/entries/[entryId]` | personCount/amount/method ändern, Invoice nachziehen |
| DELETE | `/api/attendance/[id]/entries/[entryId]` | Entry löschen (Invoice nur wenn nicht PAID) |
| POST   | `/api/attendance/[id]/issue-invoices` | bestehend, mit personCount + Listen-Kategorie |
| POST   | `/api/invoices/[id]/remind` | bestehend; auch für EXPENSE |
| POST   | `/api/invoices/[id]/markPaid` | bestehend |
| POST   | `/api/import/sepa` | bestehend; Forderungs-Match jetzt auch `type=EXPENSE` |

Body `POST /api/attendance`:
```json
{
  "clubYearId": "...",
  "eventName": "Madrid-Reise",
  "eventDate": "2026-04-12",
  "description": "Bus + Hotel + Eintritt",
  "billPerHead": 480,
  "paymentMethod": "MIXED",
  "members": [
    { "memberId": "abc", "personCount": 2, "paymentMethod": null },
    { "memberId": "def", "personCount": 1 }
  ],
  "newNonMembers": [
    { "firstName": "Anna", "lastName": "Gast", "email": "a@x.at",
      "iban": null, "paysBySEPA": false, "personCount": 1 }
  ]
}
```

Response: `{ id, categoryId }`.

## Edge cases / failure modes

- Personenzahl < 1 → 400.
- Doppeltes Mitglied → 409 ("Teilnehmer bereits in Liste").
- Ändern von `billPerHead`: bestehende Invoices mit Status PAID bleiben
  unverändert; OPEN/REMINDED werden mit neuem Betrag aktualisiert.
- Löschen einer Liste mit PAID-Forderungen → 409 mit Hinweis.
- Non-Member ohne E-Mail kann angelegt werden, mailto wird dann auf
  leeren Empfänger gesetzt → User muss selber adressieren.

## Acceptance criteria

1. Liste mit 3 Mitgliedern + 1 Non-Member, Mitglied B mit personCount=4 →
   nach "Forderungen erzeugen" gibt es 4 Invoices, B mit Betrag 4 × x.
2. Non-Member taucht in `/members` mit Chip "Gast" auf, lässt sich auf
   Status ACTIVE konvertieren ohne Datenverlust.
3. Auto-Kategorie sichtbar in `/categories` (Clubjahr-scope), wird auf
   einer manuell verknüpften Buchung sauber zugeordnet.
4. SEPA-PDF-Import einer Liste löst alle dazugehörigen EXPENSE-Invoices
   auf PAID + Allocations auf Aggregat-Buchung.
5. Mail-Knopf öffnet `mailto:` mit Vor-Befülltem Subject/Body.

## Test plan / test cases

- Unit (api):
  - POST /api/attendance: kategorie wird angelegt; entries amount korrekt.
  - PATCH list: billPerHead-Änderung aktualisiert OPEN-Invoices, nicht
    PAID.
  - PATCH entry: personCount-Änderung aktualisiert amount und ggf. invoice
    amount.
- Integration (manuell via Browser):
  - Erstellen → Bearbeiten → Forderungen erzeugen → SEPA-PDF importieren →
    alle Forderungen PAID.
- Negativ:
  - Non-Member ohne Vorname/Nachname → 400.
  - Personenzahl 0 → 400.

## Implementation notes

- Auto-Kategorie-Name: `Auslagen: <eventName>`. Bei Rename der Liste wird
  Kategorie-Name nachgezogen. Wenn Kategorie schon manuell andere
  Buchungen hat, bleibt sie bei List-Delete erhalten (entkoppeln).
- `Member.status = "NON_MEMBER"`-Werte werden in den bestehenden Filter-
  Defaults (Mitgliederliste, Dues) ausgeblendet, in `/members?status=guests`
  einblendbar.
- `paymentOverride` wird nur ausgewertet beim Issue-Invoices.
- Mailto-Pattern: identisch zu `DuesRowActions.tsx`, neue Komponente
  `ExpenseRowActions.tsx`.

## Status

- planned: ✅
- in-progress: ✅ (this iteration)
- done: ✅ (after deploy)

## Open questions

- Soll bei List-Delete die Auto-Kategorie ebenfalls gelöscht werden, falls
  noch keine Buchung sie nutzt? → ja, sonst stehen bleiben.