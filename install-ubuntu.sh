#!/usr/bin/env bash
#
# SP3 Browser – All-in-One-Setup für Ubuntu/Debian.
#
# Macht alles in einem Rutsch:
#   1. installiert Node.js (>= 20) und benötigte System-Bibliotheken
#   2. installiert die npm-Abhängigkeiten und baut die App
#   3. paketiert ein .deb (mit korrekten Rechten) und installiert es
#
# Aufruf (im Projektordner):
#   chmod +x install-ubuntu.sh
#   ./install-ubuntu.sh           # alles: bauen + .deb installieren
#   ./install-ubuntu.sh --run     # nur bauen und direkt starten (ohne Installation)
#   ./install-ubuntu.sh --no-install   # .deb bauen, aber nicht installieren
#
set -euo pipefail

# ---- Hübsche Ausgabe --------------------------------------------------------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'; else B=; G=; Y=; R=; X=; fi
step() { printf '\n%s==>%s %s%s\n' "$G" "$X" "$B" "$*$X"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%s[!]%s %s\n' "$Y" "$X" "$*"; }
die()  { printf '%s[Fehler]%s %s\n' "$R" "$X" "$*" >&2; exit 1; }

MODE="install"
for arg in "$@"; do
  case "$arg" in
    --run) MODE="run" ;;
    --no-install) MODE="build" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -n 18; exit 0 ;;
    *) die "Unbekannte Option: $arg (siehe --help)" ;;
  esac
done

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
[ -f package.json ] || die "package.json nicht gefunden – bitte das Skript im SP3-Projektordner ausführen."

# sudo nur nutzen, wenn nicht bereits root.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "sudo wird benötigt (oder als root ausführen)."
  SUDO="sudo"
fi

command -v apt-get >/dev/null 2>&1 || die "Dieses Skript ist für Ubuntu/Debian (apt). Für andere Distributionen siehe docs/BUILD.md."

export DEBIAN_FRONTEND=noninteractive

# ---- 1. System-Abhängigkeiten ----------------------------------------------
step "System-Pakete aktualisieren und Bibliotheken installieren"
$SUDO apt-get update -y
$SUDO apt-get install -y --no-install-recommends \
  ca-certificates curl git \
  libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
  libatspi2.0-0 libdrm2 libgbm1 libxcb-dri3-0 libsecret-1-0 libasound2t64 2>/dev/null \
  || $SUDO apt-get install -y --no-install-recommends \
       ca-certificates curl git \
       libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
       libatspi2.0-0 libdrm2 libgbm1 libxcb-dri3-0 libsecret-1-0 libasound2

# ---- 2. Node.js sicherstellen (>= 20) --------------------------------------
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; then NODE_OK=1; fi
fi
if [ "$NODE_OK" -eq 1 ]; then
  step "Node.js gefunden: $(node -v)"
else
  step "Node.js 20 über NodeSource installieren"
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
  info "Installiert: $(node -v)"
fi

# ---- 3. App-Abhängigkeiten und Build ---------------------------------------
step "npm-Abhängigkeiten installieren (Linux-Electron wird geladen)"
# node_modules kann von einem anderen OS stammen -> sauber neu auflösen.
if [ -d node_modules ] && [ ! -x node_modules/electron/dist/electron ]; then
  warn "node_modules stammt evtl. von einem anderen System – wird neu installiert."
  rm -rf node_modules
fi
npm install

step "App bauen (TypeScript -> dist/)"
npm run build

step "App-Icon erzeugen (optional)"
npm run icon || warn "Icon-Erzeugung übersprungen (kein Display?) – Paket nutzt Standard-Icon."

# ---- Modus: nur starten -----------------------------------------------------
if [ "$MODE" = "run" ]; then
  step "SP3 Browser startet …"
  exec npm start
fi

# ---- 4. .deb paketieren -----------------------------------------------------
step "Linux-Build entpacken und .deb paketieren"
npx --no-install electron-builder --linux dir --publish never \
  || npx electron-builder --linux dir --publish never
node scripts/make-deb.mjs

DEB="$(ls -1 release/sp3-browser_*_amd64.deb 2>/dev/null | head -n1)"
[ -n "$DEB" ] || die "Kein .deb in release/ gefunden."
info "Paket: $DEB"

if [ "$MODE" = "build" ]; then
  step "Fertig – Paket gebaut (nicht installiert)."
  info "Installieren mit:  sudo apt install ./$DEB"
  exit 0
fi

# ---- 5. Installieren --------------------------------------------------------
step "SP3 Browser installieren"
$SUDO apt-get install -y "./$DEB" || { $SUDO dpkg -i "$DEB" || true; $SUDO apt-get -f install -y; }

step "${G}Fertig!${X} SP3 Browser ist installiert."
info "Starten:  über das App-Menü (\"SP3 Browser\") oder im Terminal:  sp3-browser"
info "Falls der Start an der Sandbox scheitert:  sp3-browser --no-sandbox"
