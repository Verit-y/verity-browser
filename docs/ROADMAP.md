# Roadmap

Reihenfolge nach Nutzen für Datenschutz und Alltagstauglichkeit. Punkte
wandern erst in den README-Status, wenn sie implementiert und dokumentiert
sind.

## In Verity 0.1 umgesetzt (ehem. Roadmap)

- [x] **Workspaces** mit echter Session-Partition-Isolation und Akzentfarbe
- [x] **Persistenter, verschlüsselter Verlauf** (Seiten + Suchen, Retention)
- [x] **Privacy-Onboarding-Wizard** (9 Schritte, jederzeit wiederholbar)
- [x] **Granulare Transparenz/Glass** mit Linux-Compositing-Erkennung
- [x] **Reader-Modus**, **Bild-in-Bild**, **Session-Wiederherstellung** (opt-in)
- [x] **Experimentelle Mullvad-Erkennung**
- [x] **GitHub-Actions-CI** (Typecheck, Build, Tests, Audit)

## 0.2: Schutz vertiefen

- [x] Malware-/Phishing-/Scam-Schutz (SP3 Shield): lokale Liste +
      Heuristiken (Marken-Imitation, IP-Login-Seiten) mit Warnseite
- [ ] Live-Reputationslisten (URLhaus, OpenPhish) als lokal gespiegelte
      Feeds, ohne URL-Lookups in der Cloud
- [ ] EasyList/EasyPrivacy-Parser mit Auto-Update der Filterlisten
- [ ] Fingerprint-Schutz zum Dokumentstart (statt dom-ready)
- [ ] Per-Site-Einstellungen (JS, Cookies, Berechtigungen pro Domain)
- [ ] Datenschutz-Bericht pro Seite (Tracker-Analyse mit Bewertung)

## 0.3: Power-User

- [x] Split View (zwei Tabs nebeneinander, Strg+Alt+S)
- [x] Workspaces (siehe oben)
- [ ] Tab-Gruppen (innerhalb eines Workspace, mit Farbe/Label)
- [ ] Sidebar-Webpanels (Notizen/Kalender/Chat parallel zum Hauptinhalt)
- [ ] Benannte, dauerhafte Container mit Farbkennzeichnung
- [ ] Mausgesten und frei belegbare Tastenkürzel (UI statt JSON)
- [ ] Persistentes Blocker-Dashboard (Tages-/Wochen-Aggregation)
- [ ] Chrome-Extension-Unterstützung (uBO-artig; in Electron 33 eingeschränkt)
- [ ] Netzwerk- und Ressourcenmonitor (Developer Dashboard)

## 0.4: Ökosystem

- [ ] Plugin-Sandbox (Phase 2, siehe PLUGINS.md)
- [ ] Theme-Marktplatz mit signiertem Index
- [ ] Plugin-Store (Phase 3)
- [ ] Verschlüsselter Sync: Ende-zu-Ende, Zero-Knowledge,
      selbst hostbarer Sync-Server

## 0.5: Lokale KI (strikt opt-in)

- [x] Anbindung lokaler Modelle über Ollama (Endpunkt auf localhost
      beschränkt), Modellwahl in den Einstellungen
- [x] Seiten-Zusammenfassungen
- [x] Sicherheits- und Datenschutzbewertung der aktiven Seite
- [ ] Streaming-Antworten und Verlauf im Panel
- [ ] Erkennung weiterer lokaler Backends (llama.cpp-Server, LM Studio)

Grundsatz für alle KI-Funktionen: kein Text verlässt das Gerät, kein
Standard-Aktiviert, keine stillen Downloads von Modellen.

## Laufend

- [x] GitHub-Actions-CI: Typecheck, Build, Unit-Tests, Audit
- [ ] Build-Matrix (Windows/Linux/macOS) im CI
- [ ] Icons (`build/icon.ico`, `.icns`, `.png`) aus `assets/icon.svg` (Platzhalter aktiv)
- [ ] Übersetzungen (Englisch zuerst)
- [ ] Barrierefreiheit: vollständige Tastatursteuerung der Panels
