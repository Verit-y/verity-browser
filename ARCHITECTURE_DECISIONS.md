# ARCHITECTURE DECISIONS — Verity Browser

Kurze ADRs für den SP3 → Verity Relaunch. Format: Entscheidung / Kontext / Konsequenz.

## ADR-1: Electron + Chromium bleibt (kein Tauri/Gecko)
**Entscheidung:** Stack unverändert Electron 33 + TypeScript.
**Kontext:** Der gesamte Blocker-/Fingerprinting-/Session-Isolations-Unterbau ist Chromium-nativ (`webRequest`, `configureHostResolver`, Session-Partitionen, safeStorage). Ein Wechsel würde diesen Unterbau kosten.
**Konsequenz:** Extension-Kompatibilität und laufende Codebasis bleiben nutzbar.

## ADR-2: Renderer bleibt Vanilla TS (kein React/Vite-Rewrite)
**Entscheidung:** Der Renderer wird **nicht** auf React 18 + Vite migriert (Brief empfahl es, mit User abgestimmt dagegen).
**Kontext:** Der bestehende Renderer (`ui.ts`, 975 Z.) ist sauber, performant und läuft unter strikter CSP (`script-src 'self'`). React würde die CSP lockern (Inline-Runtime), Attack-Surface und Bundle vergrößern.
**Konsequenz:** Neue UI (Workspaces-Switcher, Onboarding, Transparenz-Regler, Verlauf-Panel) wird **modular im bestehenden Muster** ergänzt — Panel-Renderer-Funktionen in `ui.ts`, CSS-Variablen in `styles.css`. Bei weiterem Wachstum kann `ui.ts` in mehrere esbuild-Module gesplittet werden, ohne Framework.

## ADR-3: State-Management ohne Store-Library
**Entscheidung:** Kein Redux/Zustand. Weiterhin `EventEmitter`-Stores im Main + IPC-Deltas; modulare Variablen im Renderer.
**Kontext:** Bestehendes Muster (`SettingsStore`, `StatsTracker`) ist einfach und ausreichend.
**Konsequenz:** Neue Stores (`WorkspaceStore`, `HistoryStore`) folgen exakt dem `SettingsStore`-Muster (JSON-Persistenz + `emit('change')`).

## ADR-4: Styling über CSS-Variablen-Tokens (kein Tailwind)
**Entscheidung:** Erweiterung des bestehenden CSS-Variablen-Systems in `styles.css`; keine Utility-Frameworks.
**Kontext:** Das 7-Theme-System und der Live-Editor basieren auf CSS-Variablen (`--bg`, `--accent`, `--chrome-alpha`, `--radius`). Granulare Transparenz koppelt sauber daran an.
**Konsequenz:** Neue Design-Tokens (Sidebar-/Toolbar-/Popup-Alpha, Blur, Corner-Radius) sind CSS-Variablen, live setzbar analog `applyTheme()`.

## ADR-5: Verschlüsselung via safeStorage (OS-Keychain)
**Entscheidung:** Verlaufs-Verschlüsselung nutzt Electrons `safeStorage` (wie der Vault), nicht eigene AES-Schlüsselverwaltung.
**Kontext:** `vault.ts` zeigt bewährtes Muster (DPAPI/Keychain/libsecret). Master-Passwort-Ableitung wäre zusätzliche Angriffsfläche.
**Konsequenz:** `HistoryStore` verschlüsselt Einträge mit safeStorage; SP3-Lock ist optionaler, dokumentierter Stub (Fallback-only, User-Entscheidung).

## ADR-6: Workspaces auf bestehender Partition-Isolation
**Entscheidung:** Workspaces = benannte Session-Partitionen (`persist:ws-<id>`) über der vorhandenen Container-Logik.
**Kontext:** `tabs.ts:90` isoliert Cookies bereits pro Container. Workspaces sind die UI-/Persistenz-Schicht darüber.
**Konsequenz:** Echte Cookie-/Storage-Isolation pro Workspace ohne neuen Isolations-Mechanismus.
