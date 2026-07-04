# ANALYSIS — Bestandsaufnahme (SP3 Browser, Ist-Zustand vor Verity-Relaunch)

Stand: Analyse vor dem Rebrand. Diese Datei dokumentiert den Ausgangszustand.

## Stack & Versionen
- **Electron** `^33.2.0` (Chromium ~130, Node ~20 integriert)
- **TypeScript** `^5.6.3`, Build via **esbuild** `^0.24.0` (kein Webpack/Vite)
- **electron-builder** `^25.1.8`, **electron-updater** `^6.3.9`
- Renderer: **Vanilla TS + HTML/CSS**, kein UI-Framework (bewusst, minimale Attack-Surface + strikte CSP `script-src 'self'`)
- Ziel: Linux (AppImage/.deb/tar.gz), Windows (NSIS), macOS (DMG)

## Verzeichnisstruktur
- `src/main/` — Main-Process: `main.ts`, `tabs.ts` (WebContentsView-Tabs), `ipc.ts`, `settings.ts`, `stats.ts`, `vault.ts`, `themes.ts`, `plugins.ts`, `ai.ts`, `menu.ts`, `updater.ts`
- `src/main/security/` — `harden.ts`, `requestFilter.ts`, `blocklist.ts`, `doh.ts`, `fingerprint.ts`, `threats.ts`, `permissions.ts`
- `src/preload/preload.ts` — einziger contextBridge (`window.sp3`)
- `src/renderer/` — `ui.ts` (975 Z.), `index.html`, `styles.css`, `start.html`, `warning.html`
- `src/shared/types.ts` — geteilte Typen (SettingsData, TabState, ThemeSpec …)
- `themes/` — 7 JSON-Themes; `website/index.html` — statische Landingpage; `docs/` — 6 MD-Dateien; `plugins/` — Beispiel-Manifest

## IPC-Architektur
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` auf allen WebContents. Webviews global deaktiviert (`will-attach-webview` preventDefault).
- Preload exponiert `window.sp3` ausschließlich an das Chrome-Renderer, nie an Webseiten.
- Kanäle: `tabs:*` (create/close/activate/navigate/back/forward/reload/toggle-scripts/toggle-split), `chrome:*` (insets/panel/titlebar/focus-address), `settings:get/update`, `themes:list/save`, `stats:get`, `vault:status/list/add/remove`, `plugins:list`, `tools:screenshot`, `ai:status/run`. Broadcasts: `tabs:update`, `stats:update`.

## State-Management
- **Kein** Redux/Zustand. Renderer: modulare Variablen in `ui.ts`. Main: `EventEmitter`-Stores (`SettingsStore`, `StatsTracker`) + IPC-Deltas.

## Privacy-Module
- **Ad-/Tracker-Blocker**: `webRequest.onBeforeRequest` (nicht declarativeNetRequest), Host-Suffix-Matching. Kuratierte Listen: 29 Ad-, 30 Tracker-Domains. Kein volles EasyList.
- **DoH**: `app.configureHostResolver` (Chromium secure DNS). Resolver: Cloudflare (default), Quad9, Mullvad, dns0.eu — konfigurierbar über `settings.doh`.
- **Anti-Fingerprinting**: generischer Chromium-UA ohne Electron-Token; Canvas-Noise (dom-ready-Injektion); `hardwareConcurrency=4`, `deviceMemory=8`. Best-Effort, kein WebGL-Spoofing.
- **HTTPS-Only**, **GPC/DNT-Header**, **Threat-Shield** (bekannte Hosts + Heuristik Brand-Impersonation/IP-Login), **Permissions deny-by-default**.
- **Cookie-Isolation**: pro Container eigene Session-Partition (`persist:default` vs. In-Memory für privat/temporär).

## Verlauf (bestätigte Lücke)
- **Kein persistenter Browser-/Suchverlauf.** Navigation nur per-Session in-memory (`navigationHistory`, nur für Back/Forward). Stats ebenfalls nur in-memory (Reset bei Exit). Grund: nie implementiert — Datenminimierung als Design-Prinzip. Wird mit Verity als opt-in (inkl. verschlüsselt) nachgerüstet.

## Build-Pipeline
- `build.mjs`: esbuild bundelt main (cjs), preload (cjs), renderer/ui (iife); kopiert HTML/CSS nach `dist/renderer/`.
- `electron-builder.yml`: appId `com.sp3.browser`, GitHub-Releases-Updater (`sp3-browser/sp3-browser`).
- Scripts: `build`, `typecheck`, `start`, `dev`, `smoke` (PNG-Capture zur Verifikation), `dist*`.

## Bereits vorhandene "Zen/Arc"-Features
Vertikale Sidebar (Default), Split-View (`tabs.ts:186`), Command-Palette (`#cmd`), Theme-Editor + JSON Im/Export, verschlüsselter Vault (safeStorage/OS-Keychain), Container-Tabs, lokaler AI-Assistent (Ollama, opt-in).

## Fehlend (Verity-Kernarbeit)
Onboarding-Wizard, persistenter/verschlüsselter Verlauf, echte Workspaces, granulare Transparenz-Regler, Reader-Modus, PiP-UI, Tab-Gruppen, Session-Restore, Sidebar-Webpanels, Mullvad-Erkennung, SP3-Lock-Bridge.

## TODOs / Einschränkungen im Code
- Blocklisten sind Starter-Sets (EasyList auf Roadmap).
- Threat-Liste enthält nur Demo-/Test-Hosts, keine Cloud-Lookups.
- Plugins: nur Erkennung (Phase 1), keine Ausführung/Sandbox.
- Fingerprinting: Best-Effort, nicht angriffssicher (dok. in `docs/SECURITY.md`).
