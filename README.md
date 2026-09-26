# STL-Bibliothek

Komplette kleine Web-App für GitHub Pages. Alles bleibt in **einem Repository**.

## Struktur

```text
index.html
style.css
app.js
models.json
stl/
  Weltraum/
  Fossilien/
  Technik/
```

## Eigene Modelle hinzufügen

1. STL-Datei in einen Unterordner von `stl/` legen.
2. In `models.json` einen Eintrag ergänzen.

Beispiel:

```json
{
  "title": "Rakete",
  "category": "Weltraum",
  "description": "Eine kleine Modellrakete.",
  "file": "stl/Weltraum/rakete.stl"
}
```

Die drei vorhandenen Einträge sind nur Beispiele. Im ZIP liegen absichtlich keine erfundenen STL-Dateien.

## GitHub Pages

Repository hochladen → `Settings` → `Pages` → `Deploy from a branch` → `main` → `/ (root)` → speichern.

## Funktionen

- STL direkt im Browser anzeigen
- Kategorien
- Suche
- Drehen, Zoomen, Verschieben
- Auto-Zentrierung
- Drahtgitter
- Farbe wählen
- Vollbild
- Abmessungen und Dreiecksanzahl
- STL herunterladen
- eigene lokale STL testweise öffnen

Hinweis: Three.js wird über unpkg.com geladen; beim Aufruf braucht die Seite daher Internetzugang.
