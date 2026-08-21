# Hablamos – Spanisch-Sprechtrainer

Eigenständige Web-App (eine einzige HTML-Datei, kein Server, kein Build) zum
Sprechen-Lernen für Mallorca.

## Benutzen

**Feste Adresse (empfohlen, volle Mikrofon-Unterstützung):**
<https://hablamos-constantin-veyder-malbergs-projects.vercel.app>
– in Chrome, Edge oder Safari öffnen, am Handy „Zum Home-Bildschirm hinzufügen“.

Alternativ `index.html` lokal im Browser öffnen. Beim ersten Antippen des
Mikrofon-Buttons fragt der Browser nach der Mikrofon-Erlaubnis.

Wichtig: Die Spracherkennung des Browsers funktioniert nur, wenn die App als
eigene Seite läuft (Vercel-Adresse oder lokale Datei). In eingebetteten
Fenstern (z. B. Artefakt-Vorschau) blockiert der Browser sie oft – die App
zeigt dann eine entsprechende Meldung unter dem Mikrofon-Button.

## Funktionen

- **Deutsch → Spanisch**: deutschen Satz sehen, spanisch sprechen; die App
  erkennt die Antwort und markiert Wort für Wort, was gepasst hat.
- **Nachsprechen**: spanischen Satz anhören (normal oder langsam) und nachsprechen.
- **Spaced Repetition**: richtig gesprochene Sätze kommen in wachsenden
  Abständen wieder, schwierige sofort.
- **Mallorca-Szenarien**: Smalltalk, Café, Restaurant, Markt, Taxi,
  Handwerker/Nachbarn, Haushalt/Hausangestellte, Bank, Behörden, Gesundheit –
  102 Sätze, erweiterbar.
- **Fortschritt**: Wochenziel (einstellbar), 14-Tage-Übersicht, Stand pro
  Szenario, Zahl der sicher gekonnten Sätze.
- **Eigene Sätze**: unter „Bibliothek“ eintragen, was man vor Ort sagen wollte.
- **Backup**: Export/Import des Lernstands als JSON (Speicherung sonst lokal
  im Browser, `localStorage`).

Ohne Spracherkennung (z. B. Firefox) funktioniert alles außer der
Aufnahme: Lösung aufdecken, laut sprechen, selbst bewerten.
