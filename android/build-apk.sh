#!/usr/bin/env bash
# Baut das Verity-Browser-Mobile-APK ohne Gradle, nur mit den Android-build-tools.
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/34.0.0"
PLAT="$SDK/platforms/android-34/android.jar"
AAPT2="$BT/aapt2"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

rm -rf build
mkdir -p build/compiled build/gen build/obj

echo "[1/7] Ressourcen kompilieren (aapt2 compile)…"
"$AAPT2" compile --dir res -o build/compiled/res.zip

echo "[2/7] Ressourcen linken (aapt2 link)…"
"$AAPT2" link -o build/base.apk -I "$PLAT" \
  --manifest AndroidManifest.xml \
  --java build/gen \
  --min-sdk-version 24 --target-sdk-version 34 \
  build/compiled/res.zip

echo "[3/7] Java kompilieren (javac, Ziel Java 11 für d8)…"
javac --release 8 -g:none -d build/obj -classpath "$PLAT" -sourcepath "java:build/gen" \
  java/com/verity/mobile/MainActivity.java build/gen/com/verity/mobile/R.java

echo "[4/7] Dexen (d8)…"
"$BT/d8" --min-api 24 --lib "$PLAT" --output build $(find build/obj -name '*.class')

echo "[5/7] classes.dex ins APK legen…"
( cd build && zip -q -uj base.apk classes.dex )

echo "[6/7] zipalign…"
"$BT/zipalign" -f 4 build/base.apk build/verity-browser-unsigned.apk

echo "[7/7] Signieren (Debug-Keystore)…"
KS="build/verity.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias verity \
    -storepass android -keypass android \
    -dname "CN=Verity Browser, O=Verity, C=DE" \
    -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out build/verity-browser.apk build/verity-browser-unsigned.apk

echo
echo "FERTIG → $HERE/build/verity-browser.apk"
ls -lh build/verity-browser.apk
