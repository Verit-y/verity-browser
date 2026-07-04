# Sicherheitsmodell

SP3 dokumentiert ehrlich, was implementiert ist, wie es wirkt und wo die
Grenzen liegen. Marketing ohne Substanz ist selbst ein Sicherheitsrisiko.

## Bedrohungsmodell

SP3 schützt primär gegen:

1. **Kommerzielles Tracking** (Werbenetzwerke, Analyse-Dienste, Fingerprinting)
2. **Passive Netzwerkbeobachtung** (Klartext-HTTP, Klartext-DNS)
3. **Übergriffige Webseiten** (ungefragte Kamera-/Mikrofon-/Standortzugriffe,
   WebRTC-IP-Leaks, Popup-Missbrauch)
4. **Lokalen Datenzugriff** auf gespeicherte Passwörter

SP3 schützt **nicht** gegen staatliche Zielüberwachung, kompromittierte
Betriebssysteme oder Malware, die bereits auf dem Gerät läuft.

## Implementierte Schutzfunktionen

### Netzwerk

| Funktion | Umsetzung | Grenzen |
|---|---|---|
| HTTPS-Only | `onBeforeRequest` hebt HTTP-Hauptframes auf HTTPS an (`requestFilter.ts`) | Subressourcen mischen Browser-seitig; localhost ist ausgenommen |
| DNS-over-HTTPS | Chromium Secure-DNS im Modus `secure`, Server wählbar (`doh.ts`) | DNS-over-TLS bietet der Chromium-Netzwerk-Stack nicht an; unter Windows/Linux lässt sich DoT systemweit konfigurieren |
| WebRTC-Schutz | `setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` pro Tab | Kann WebRTC-Anwendungen hinter restriktiven NATs verlangsamen |
| Global Privacy Control | `Sec-GPC: 1` und `DNT: 1` auf jedem Request | Rechtlich relevant u. a. in Kalifornien; technisch unverbindlich |

### Inhalte

| Funktion | Umsetzung | Grenzen |
|---|---|---|
| Ad-/Tracker-Blocker | Hostbasierte Sperrliste vor dem Laden (`blocklist.ts`) | Kuratierte Starterliste; EasyList-Unterstützung ist Roadmap |
| Malware-/Phishing-/Scam-Schutz (SP3 Shield) | Lokale Prüfung jeder Top-Level-Navigation (`threats.ts`): kuratierte Schadseiten-Liste, Marken-Imitations-Heuristik (z. B. `paypal-verify.example`), Login-Seiten auf rohen IP-Adressen. Blockierte Seiten zeigen eine Warnseite mit bewusstem „Trotzdem fortfahren" (Freigabe nur für die Sitzung) | Rein lokal, kein Cloud-Lookup einzelner URLs. Heuristiken sind bewusst konservativ (keine False-Positives auf echte Markendomains oder IDN-Domains wie `münchen.de`); Live-Feeds (URLhaus, OpenPhish) sind Roadmap. Demo: `http://malware.sp3.test` |
| Script-Blocker | Tab wird mit `javascript: false` neu erstellt | Gilt pro Tab, nicht pro Domain |
| Berechtigungen | Deny-by-Default für Kamera, Mikrofon, Standort, Benachrichtigungen u. a.; Freigaben pro Origin in den Einstellungen | Freigaben gelten dauerhaft bis zum Widerruf |
| Popup-Kontrolle | `setWindowOpenHandler` erzwingt neue, gehärtete Tabs | Kein separater Popup-Blocker-Dialog |

### Fingerprinting

| Funktion | Umsetzung | Grenzen |
|---|---|---|
| Generischer User-Agent | Reduzierter UA ohne Electron-Token, nur Chrome-Major-Version | UA-Client-Hints werden von Chromium teilweise weiter gesendet |
| Canvas-Schutz | Main-World-Injektion bei `dom-ready`: Rauschen auf `toDataURL`/`toBlob`, normalisierte `hardwareConcurrency`/`deviceMemory` | Best-Effort: Skripte, die vor `dom-ready` fingerprinten, werden nicht erfasst. Eine Injektion zum Dokumentstart ist Roadmap |

**Ehrliche Einordnung:** Anti-Fingerprinting in einem Einzelprojekt erreicht
nie das Niveau der Tor-Browser-Uniformität. SP3 reduziert die Erkennbarkeit,
verspricht aber keine Anonymität.

### Daten

| Funktion | Umsetzung |
|---|---|
| Cookie-Isolierung | Session-Partitionen pro Container; temporäre Container und private Tabs sind rein flüchtig (RAM) |
| Cookie-Autolöschung | `clearStorageData({storages:['cookies']})` beim Beenden, opt-in |
| Passwort-Tresor | `safeStorage`: DPAPI (Windows), Keychain (macOS), libsecret/kwallet (Linux). Auf der Festplatte liegen nur Chiffrate |
| Lokale Einstellungen | Klartext-JSON ohne Geheimnisse; Geheimnisse liegen ausschließlich im Tresor |

### Prozess-Sicherheit

- Site-Isolation durch Chromium-Prozessmodell (ein Renderer pro Site)
- Chrome-UI: `contextIsolation: true`, `sandbox: true`, strikte CSP,
  kein `eval`, keine Remote-Inhalte
- Webseiten: kein Preload, keine Node-Integration, kein Zugriff auf die
  `sp3`-API
- `BrowsingTopics`, `InterestCohort` und `IdleDetection` sind per
  Kommandozeilen-Switch deaktiviert

### Lokaler KI-Assistent

- Strikt opt-in, standardmäßig deaktiviert
- Endpunkt ist auf `localhost` beschränkt (erzwungen in `ai.ts`) –
  Seiteninhalte können das Gerät bauartbedingt nicht verlassen
- Läuft ausschließlich auf expliziten Klick, nie automatisch

## Geplant (Roadmap, siehe ROADMAP.md)

- Live-Reputationslisten (URLhaus, OpenPhish) als lokal gespiegelte Feeds
  für SP3 Shield
- EasyList/EasyPrivacy mit Update-Mechanismus
- Fingerprint-Schutz zum Dokumentstart
- Verschlüsselter Sync (Ende-zu-Ende, Zero-Knowledge)

## Schwachstellen melden

Bitte per GitHub Security Advisory (privat) melden, nicht als öffentliches
Issue. Wir bestätigen innerhalb von 72 Stunden.
