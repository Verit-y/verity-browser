# Roadmap

Reihenfolge nach Nutzen für Datenschutz und Alltagstauglichkeit. Punkte
wandern erst in den README-Status, wenn sie implementiert und dokumentiert
sind.

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
- [ ] Tab-Gruppen und Workspaces
- [ ] Benannte, dauerhafte Container mit Farbkennzeichnung
- [ ] Mausgesten und frei belegbare Tastenkürzel (UI statt JSON)
- [ ] Markdown-Notizen-Panel, Terminal-Panel
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

- [ ] GitHub-Actions-CI: Typecheck, Smoke-Test, Build-Matrix
- [ ] Icons (`build/icon.ico`, `.icns`, `.png`) aus `assets/icon.svg`
- [ ] Übersetzungen (Englisch zuerst)
- [ ] Barrierefreiheit: vollständige Tastatursteuerung der Panels
