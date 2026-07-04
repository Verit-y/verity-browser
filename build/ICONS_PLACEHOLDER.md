# PLACEHOLDER — Icon-Bitmaps neu generieren

`build/icon.png` und `build/icon.ico` sind noch die **alten SP3-Bitmaps** und müssen
aus der neuen `assets/icon.svg` ("V"-Monogramm) neu erzeugt werden:

```
npm run icon
```

Das Skript (`scripts/make-icon.mjs`) rendert die neue SVG über Electron zu
`build/icon.png` (Linux) und `build/icon.ico` (Windows). Muss auf einer Plattform mit
lauffähigem Electron ausgeführt werden (in der aktuellen Dev-Umgebung ist nur eine
Windows-Electron-Binary installiert). Danach diese Datei entfernen.

Durch finales Branding ersetzen, sobald ein finales Icon-Design vorliegt.
