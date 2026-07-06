#!/usr/bin/env bash
# Richtet die "Verity Firefox Edition" ein: erstellt ein Firefox-Profil "Verity",
# spielt die Verity-Datenschutz-Prefs (user.js) und den Verity-Look (userChrome.css)
# ein und legt einen eigenen Starter an. Nutzt das per Flatpak installierte Firefox.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ID="org.mozilla.firefox"
FFDIR="$HOME/.var/app/$APP_ID/.mozilla/firefox"

echo "[1/5] Firefox-Profil 'Verity' anlegen…"
mkdir -p "$FFDIR"
if ! ls -d "$FFDIR"/*.Verity >/dev/null 2>&1; then
  flatpak run "$APP_ID" --headless -CreateProfile Verity >/dev/null 2>&1 || true
  sleep 2
fi
PROFILE="$(ls -d "$FFDIR"/*.Verity 2>/dev/null | head -1)"
if [ -z "${PROFILE:-}" ]; then
  # Fallback: Profil manuell registrieren
  PROFILE="$FFDIR/verity.Verity"
  mkdir -p "$PROFILE"
  if [ ! -f "$FFDIR/profiles.ini" ]; then
    cat > "$FFDIR/profiles.ini" <<INI
[Profile0]
Name=Verity
IsRelative=1
Path=verity.Verity

[General]
StartWithLastProfile=1
Version=2
INI
  fi
fi
echo "     Profil: $PROFILE"

echo "[2/5] Datenschutz-Prefs (user.js) einspielen…"
cp "$HERE/user.js" "$PROFILE/user.js"

echo "[3/5] Verity-Look (userChrome.css) einspielen…"
mkdir -p "$PROFILE/chrome"
cp "$HERE/chrome/userChrome.css" "$PROFILE/chrome/userChrome.css"

echo "[4/5] Starter anlegen…"
ICON="$(ls /usr/share/icons/hicolor/512x512/apps/verity-browser.png 2>/dev/null || echo firefox)"
DESK_MENU="$HOME/.local/share/applications/verity-firefox.desktop"
DESK_DESKTOP="$HOME/Schreibtisch/verity-firefox.desktop"
read -r -d '' ENTRY <<EOF || true
[Desktop Entry]
Type=Application
Name=Verity (Firefox Edition)
Comment=Verity auf Firefox-Basis – Datenschutz-Browser
Exec=flatpak run $APP_ID -P Verity --name verity-firefox %U
Icon=$ICON
Terminal=false
Categories=Network;WebBrowser;
StartupWMClass=verity-firefox
StartupNotify=true
EOF
printf '%s\n' "$ENTRY" > "$DESK_MENU"
printf '%s\n' "$ENTRY" > "$DESK_DESKTOP"
chmod +x "$DESK_MENU" "$DESK_DESKTOP"
gio set "$DESK_DESKTOP" metadata::trusted true 2>/dev/null || true

echo "[5/5] Fertig."
echo "     Start:  flatpak run $APP_ID -P Verity"
echo "     oder über den Starter 'Verity (Firefox Edition)' im Menü/Desktop."
