# Build, Installer, Updates

## Voraussetzungen

- Node.js 20 oder neuer
- npm 10 oder neuer
- Windows, Linux oder macOS

## Entwicklung

```bash
npm install        # Abhängigkeiten inkl. Electron-Binary
npm start          # Build (esbuild) + Browser starten
npm run typecheck  # Strikte TypeScript-Prüfung ohne Emit
npm run smoke      # Headless-Boot-Test (gibt SP3_SMOKE_OK aus)
```

`build.mjs` bündelt drei Targets nach `dist/`:
`main.js` (Hauptprozess), `preload.js` (Bridge), `renderer/ui.js` plus
statische Dateien (`index.html`, `styles.css`).

Hinweis Windows: Schlägt der Electron-Download während `npm install` fehl
(Firmen-Proxy, unterbrochene Verbindung), hilft:

```powershell
Remove-Item -Recurse node_modules\electron\dist
node node_modules\electron\install.js
```

## Installer bauen

```bash
npm run dist        # Plattform des Hosts
npm run dist:win    # NSIS-Installer (.exe)
npm run dist:linux  # AppImage + .deb + tar.gz
npm run dist:mac    # DMG (Signierung/Notarisierung erfordert Apple-Zertifikat)
```

Die Artefakte landen in `release/`. Konfiguration: `electron-builder.yml`.

### Ubuntu: Ein-Befehl-Setup

Am einfachsten direkt auf dem Ubuntu-Rechner (im Projektordner):

```bash
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

Das Skript installiert Node.js und die nötigen Bibliotheken, baut die App,
paketiert das `.deb` und installiert es. Varianten: `--run` (nur bauen und
starten) und `--no-install` (nur das `.deb` erzeugen).

### Ubuntu/Debian (.deb) unter Windows

`electron-builder` baut `.deb` und `AppImage` unter Windows nur mit Docker oder
WSL (sie brauchen `fpm` bzw. privilegierte Symlinks). Damit ein **echtes,
installierbares Ubuntu-Paket** auch ohne diese Tools entsteht, gibt es
`scripts/make-deb.mjs`: es paketiert `release/linux-unpacked/` direkt in ein
`.deb` (ar + zwei ustar/gzip-Archive) **mit korrekten Unix-Rechten** – kein
`chmod` nötig:

```bash
npm run dist:ubuntu
```

Das erzeugt `release/sp3-browser_<version>_amd64.deb` mit:

- `/opt/SP3 Browser/` (Binary `0755`, `chrome-sandbox` setuid `4755`),
- `/usr/bin/sp3-browser` (Symlink), `.desktop`-Eintrag und Icon,
- `postinst`, das `chrome-sandbox` als `root:root 4755` setzt.

Installation auf Ubuntu:

```bash
sudo apt install ./sp3-browser_0.1.0_amd64.deb    # zieht Abhängigkeiten mit
# oder:  sudo dpkg -i sp3-browser_0.1.0_amd64.deb && sudo apt -f install
```

Danach startet „SP3 Browser" aus dem App-Menü oder per `sp3-browser` im Terminal.

### Tarball (jede Linux-Distribution)

Plattformübergreifend ohne jegliches Tooling:

```bash
npx electron-builder --linux tar.gz --publish never
```

Ergebnis: `release/sp3-browser-<version>.tar.gz`. Hinweis: Unter Windows gebaut,
verliert der Tarball die Exec-Bits – daher auf Linux einmalig
`chmod +x sp3-browser` (das `.deb` oben hat dieses Problem nicht).

### AppImage / echte CI-Pakete

`AppImage` und signierte Multi-Distro-Pakete am besten auf einem Linux-Host oder
per Docker bauen (`npm run dist:linux`). Ein GitHub-Actions-Workflow mit
Build-Matrix für alle drei Plattformen ist auf der Roadmap.

### App-Icons

Quelle ist `assets/icon.svg` (Fuchs-P-Marke auf schwarzer Kachel).
Windows- und Linux-Icons werden ohne externe Werkzeuge generiert –
Electron rastert das SVG selbst:

```bash
npm run icon   # erzeugt build/icon.ico (16-256 px) und build/icon.png (512 px)
```

`npm run dist` ruft das automatisch vor dem Paketieren auf.
Nur macOS braucht zusätzlich `build/icon.icns` (per `iconutil` aus einem
PNG-Set, siehe Apple-Doku). Fehlt eine Datei, verwendet electron-builder
das Electron-Standard-Icon (Builds funktionieren trotzdem).

## Update-System

SP3 nutzt `electron-updater` mit GitHub Releases als Update-Quelle
(`publish`-Block in `electron-builder.yml`):

1. Version in `package.json` erhöhen
2. `npm run dist` und die Artefakte (inkl. `latest.yml`) als
   GitHub-Release veröffentlichen
3. Paketierte Installationen prüfen beim Start automatisch und
   installieren Updates nach Bestätigung

In der Entwicklung ist der Updater bewusst deaktiviert (`app.isPackaged`).

## Releases reproduzieren

`package-lock.json` einchecken, CI mit `npm ci` bauen. Geplant:
GitHub-Actions-Workflow mit Build-Matrix für alle drei Plattformen und
SHA-256-Summen je Artefakt im Release-Text.
