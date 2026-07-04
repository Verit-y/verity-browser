# Theme-System

SP3-Themes sind einzelne JSON-Dateien. Vorinstallierte Themes liegen in
`themes/`, eigene Themes in `<userData>/themes/` (eigene überschreiben
vorinstallierte bei gleicher ID).

## Format

```json
{
  "id": "mein-theme",
  "name": "Mein Theme",
  "author": "Dein Name",
  "dark": true,
  "colors": {
    "bg": "#17191d",
    "bgElevated": "#1f2228",
    "fg": "#e6e8eb",
    "fgMuted": "#9aa3ad",
    "accent": "#6c8cff",
    "accentFg": "#0c0e12",
    "border": "#2c313a",
    "danger": "#ff5562",
    "success": "#3ecf8e"
  },
  "font": "'Cascadia Code', monospace",
  "radius": 10,
  "transparency": 1,
  "animations": true
}
```

| Feld | Bedeutung |
|---|---|
| `colors.*` | 6-stellige Hex-Werte; werden 1:1 auf CSS-Variablen der Chrome-UI gemappt |
| `font` | CSS-`font-family` der Oberfläche (optional) |
| `radius` | Eckenradius in Pixeln, 0 bis 20 |
| `transparency` | Deckkraft der Chrome-Flächen, 0.5 bis 1 (Glas-Effekt) |
| `animations` | `false` schaltet alle UI-Übergänge ab |

## Vorinstallierte Themes

| ID | Charakter |
|---|---|
| `sp3-clean` | Minimalistisch, Weiß/Grau |
| `sp3-dark` | Schwarz/Grau, der Standard |
| `sp3-hacker` | Schwarz mit grünen Akzenten, Monospace, Terminal-Look |
| `sp3-cyber` | Dunkel mit Neon-Akzenten (Cyan/Magenta) |
| `sp3-malware-hunter` | Rot/Schwarz, Fokus auf das Sicherheits-Dashboard |
| `sp3-stealth` | Maximal reduziert, Animationen aus |
| `sp3-glass` | Transparente Glasoptik, große Radien |

## Theme-Editor

Im Browser unter dem Paletten-Symbol:

- **Live-Vorschau**: Jede Änderung wirkt sofort auf die laufende Oberfläche
- **Speichern & anwenden** legt das Theme in `<userData>/themes/` ab
- **Exportieren** lädt das Theme als `<id>.sp3-theme.json` herunter
- **Importieren** liest jede gültige Theme-JSON ein

## Theme-Marktplatz

Der Marktplatz (Durchsuchen und Installieren mit einem Klick) ist in
Vorbereitung. Bis dahin funktioniert der Austausch über die
Import-/Export-Dateien, z. B. via GitHub-Repos oder Foren-Anhänge.
Geplantes Verzeichnisformat: ein Git-Repository mit einem Theme pro Datei
plus Index-JSON; Signierung der Einträge wird geprüft.
