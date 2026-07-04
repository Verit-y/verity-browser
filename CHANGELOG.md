# Changelog

Alle nennenswerten Änderungen an diesem Projekt.

## [0.1.0] — SP3 Browser → Verity

Kompletter Relaunch von „SP3 Browser" als **Verity** — Rebrand plus grundlegende
Erweiterung von Design, Privacy-UX und Funktionsumfang.

### Rebrand
- Vollständige Umbenennung SP3 → Verity: `package.json`, `electron-builder.yml`
  (`com.verity.browser`, GitHub `Verit-y/verity`), UI-/Menü-/Konsolen-Strings,
  Warnseite (Verity Shield), internes Protokoll `verity://start`, `window.verity`-API,
  Theme-IDs `verity-*`. Platzhalter-„V"-Monogramm-Icons (Originale gesichert).
- Automatische Migration alter SP3-Einstellungen (Theme-IDs, Protokoll, Booleans→Level).
- Generischer Chromium-User-Agent beibehalten (kein Verity-Suffix → Fingerprinting-Schutz).

### Neu
- **Privacy-Onboarding-Wizard** (9 Schritte, verpflichtend beim ersten Start,
  jederzeit erneut durchlaufbar) mit „Was bedeutet das technisch?"-Erklärungen.
- **Workspaces** mit echter Session-Partition-Isolation, Akzentfarbe, Drag&Drop,
  Kontextmenü und Ctrl+1..9-Shortcuts.
- **Persistenter Verlauf**: off / Klartext / **verschlüsselt** (safeStorage/OS-Keychain),
  getrennte Erfassung von Seiten und Suchanfragen, Retention, durchsuchbares Panel.
- **Granulare Transparenz / Glass-Engine**: Deckkraft je UI-Bereich, Blur, Eckenradius,
  Sidebar-Seite, Compact-/Mono-Modus, Akzentfarbe — mit Linux-Compositing-Erkennung
  und Hinweis-Banner statt stiller Fehlfunktion.
- **Reader-Modus**, **Bild-in-Bild**, **Session-Wiederherstellung** (opt-in),
  **experimentelle Mullvad-Erkennung**.
- **SP3-Lock-Bridge** als Stub/Fallback (eingebauter safeStorage-Tresor bleibt Standard).
- Mullvad Leta als Suchmaschine.

### Qualität & Infrastruktur
- Vitest-Unit-Tests (Blocklist, Settings-Migration/Sync, DoH-Switch, Verlaufs-Crypto).
- GitHub-Actions-CI (typecheck, build, test, `npm audit`). 0 Produktions-Lücken.
- `ANALYSIS.md`, `ARCHITECTURE_DECISIONS.md`, `TESTING.md`.

### Bekannte Einschränkungen
- Echte Fenstertransparenz ist unter Linux compositor-abhängig (Fallback: CSS-Glass).
- SP3-Lock-Integration ist nur ein Stub (Protokoll noch nicht spezifiziert).
- Icon-Bitmaps (`build/icon.*`) müssen per `npm run icon` aus der neuen SVG erzeugt werden.
- Tab-Gruppen, Sidebar-Webpanels, persistentes Blocker-Dashboard und
  Chrome-Extension-Unterstützung sind noch offen (siehe ROADMAP).
