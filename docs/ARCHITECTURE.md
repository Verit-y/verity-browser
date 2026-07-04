# Architektur

SP3 basiert auf Electron (Chromium + Node.js) und ist strikt in drei Prozesse
getrennt. Sämtlicher Code ist TypeScript, gebündelt mit esbuild.

## Prozessmodell

```
┌────────────────────────────────────────────────────────────┐
│ Hauptprozess (src/main)                                    │
│  main.ts        Bootstrap, Fenster, Lebenszyklus           │
│  tabs.ts        TabManager: WebContentsView pro Tab        │
│  settings.ts    Persistente Einstellungen (JSON)           │
│  stats.ts       Sicherheitszähler für das Dashboard        │
│  vault.ts       Verschlüsselter Tresor (safeStorage)       │
│  themes.ts      Theme-Laden/-Speichern                     │
│  plugins.ts     Plugin-Manifest-Erkennung (Phase 1)        │
│  updater.ts     Auto-Update (electron-updater)             │
│  ipc.ts         Alle IPC-Endpunkte                         │
│  security/      Schutzmodule (siehe unten)                 │
├────────────────────────────────────────────────────────────┤
│ Preload (src/preload)                                      │
│  preload.ts     contextBridge-API „sp3" nur für die        │
│                 Chrome-UI, niemals für Webseiten           │
├────────────────────────────────────────────────────────────┤
│ Renderer (src/renderer)                                    │
│  ui.ts          Tabs, Adressleiste, Panels, Theme-Editor   │
│  index.html     Chrome-Markup mit strikter CSP             │
│  styles.css     Theme-Variablen, Layouts                   │
└────────────────────────────────────────────────────────────┘
```

## Tabs als WebContentsView

Seiteninhalte laufen nicht in `<webview>` oder iframes, sondern als
`WebContentsView`-Instanzen, die der Hauptprozess unterhalb der Chrome-UI
positioniert. Vorteile:

- Echte Site-Isolation durch Chromium-Prozesstrennung pro Tab
- Die Chrome-UI hat keinerlei direkten Zugriff auf Seiteninhalte
- Jeder Tab kann eine eigene Session-Partition besitzen

Die Chrome-UI meldet ihre Maße per IPC (`chrome:insets`), der TabManager
setzt daraus die Bounds des aktiven Views. Vertikale Tabs sind damit ein
reines Renderer-Layout, der Hauptprozess passt nur die Geometrie an.

## Session-Härtung

`security/harden.ts` wendet auf jede Session-Partition genau einmal an:

1. **Generischer User-Agent** (`fingerprint.ts`)
2. **Request-Filter** (`requestFilter.ts`): ein einzelner
   `onBeforeRequest`-Handler für HTTPS-Upgrade und Ad-/Tracker-Blocking
   (Electron erlaubt nur einen Listener pro Session), plus
   `Sec-GPC: 1` und `DNT: 1` auf jedem Request
3. **Berechtigungs-Handler** (`permissions.ts`): Deny-by-Default

Container-Isolation entsteht über Partitionen:

| Tab-Typ | Partition | Persistenz |
|---|---|---|
| Standard | `persist:default` | Festplatte |
| Benannter Container | `persist:container-<name>` | Festplatte, getrennt |
| Temporärer Container | `temp-<zeitstempel>` | Nur RAM |
| Privater Tab | `private-<zeitstempel>` | Nur RAM |

## IPC-Disziplin

- Webseiten erhalten **kein** Preload und **keine** Node-Integration
- Die Chrome-UI läuft mit `contextIsolation: true` und `sandbox: true`
- Alle IPC-Kanäle sind in `ipc.ts` zentral registriert und typisiert
  über `src/shared/types.ts`
- `will-attach-webview` wird global unterbunden, `setWindowOpenHandler`
  leitet Popups in neue, gehärtete Tabs um

## Build

`build.mjs` bündelt drei Targets (main, preload, renderer) mit esbuild;
`tsc --noEmit` sichert die Typen. `electron-builder` paketiert
NSIS (Windows), DMG (macOS), AppImage/deb (Linux).
