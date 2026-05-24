# Eingangsrechnungs-Mails / Anhänge

## Overview
Eingangsrechnungen kommen per E-Mail. Der Schatzmeister kann (a) die `.eml`-Datei oder (b) das PDF/Bild der Rechnung an einen Umsatz hängen. Rechnungsprüfer können die Quellbelege zu jeder Buchung einsehen und herunterladen.

## User flows
- In der Buchungs-Detailansicht: "Beleg hinzufügen" → File-Drop (.pdf, .eml, .png, .jpg).
- Beleg wird hochgeladen, Server speichert in `/uploads/<uuid>.<ext>` und legt `Attachment` an, verlinkt mit `Transaction.attachmentId`.
- Download-Button öffnet `/api/attachments/:id`.

## Data model
```
Attachment {
  id, fileName, mimeType, sizeBytes, storagePath, kind [INVOICE, RECEIPT, EMAIL, OTHER],
  uploadedById, uploadedAt
}
Transaction.attachmentId → Attachment.id (1:1)
```

Optional erweiterbar zu N:M später.

## API
- `POST /api/attachments` (multipart) → `{id, fileName}`
- `GET /api/attachments/:id` → Stream-Download
- `PATCH /api/transactions/:id` mit `attachmentId`

## Acceptance
- PDF-Anhang an Buchung sichtbar, downloadbar.
- Größenlimit 20 MB.

## Status: done