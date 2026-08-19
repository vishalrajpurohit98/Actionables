#!/usr/bin/env bash
# ============================================================
#  build-apk.sh — compile the Actionables web app into a signed APK
#  using only Android SDK command-line tools (no Gradle / no Studio).
#
#  Expects (env vars, all optional except where noted):
#    ANDROID_HOME        path to Android SDK          (required)
#    BUILD_TOOLS_VER     e.g. 35.0.0                  (default 35.0.0)
#    PLATFORM_VER        e.g. android-34              (default android-34)
#    WEB_DIR             folder holding the web app   (default: repo root)
#    KEYSTORE            path to signing keystore     (required)
#    KS_PASS             keystore password            (required)
#    KEY_ALIAS           key alias                    (required)
#    KEY_PASS            key password                 (default: = KS_PASS)
#    OUT_APK             output apk path              (default build/Actionables.apk)
#
#  Run from inside the android-wrapper/ directory.
# ============================================================
set -euo pipefail

BUILD_TOOLS_VER="${BUILD_TOOLS_VER:-35.0.0}"
PLATFORM_VER="${PLATFORM_VER:-android-34}"
WEB_DIR="${WEB_DIR:-..}"                      # default: parent = repo root
OUT_APK="${OUT_APK:-build/Actionables.apk}"
APP_VERSION="${APP_VERSION:-6.24}"
WEB_COMMIT="${WEB_COMMIT:-dev}"
KEY_PASS="${KEY_PASS:-${KS_PASS:-}}"

: "${ANDROID_HOME:?set ANDROID_HOME}"
: "${KEYSTORE:?set KEYSTORE}"
: "${KS_PASS:?set KS_PASS}"
: "${KEY_ALIAS:?set KEY_ALIAS}"

BT="$ANDROID_HOME/build-tools/$BUILD_TOOLS_VER"
PLAT="$ANDROID_HOME/platforms/$PLATFORM_VER/android.jar"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo ">> cleaning"
rm -rf build && mkdir -p build/compiled build/gen build/obj build/apk build/stage/assets

echo ">> staging web assets from: $WEB_DIR"
# copy the web app, excluding repo/CI noise
rsync -a \
  --exclude '.git' --exclude '.github' --exclude 'android-wrapper' \
  --exclude 'node_modules' --exclude '*.apk' --exclude '.nojekyll' \
  "$WEB_DIR"/ build/stage/assets/
# sanity: the app entry point must exist
test -f build/stage/assets/index.html || { echo "ERROR: index.html not found in $WEB_DIR"; exit 1; }

echo ">> aapt2 compile resources"
"$BT/aapt2" compile --dir res -o build/compiled/res.zip

echo ">> aapt2 link"
"$BT/aapt2" link \
  -o build/apk/base.apk \
  -I "$PLAT" \
  --manifest AndroidManifest.xml \
  --min-sdk-version 24 --target-sdk-version 34 \
  --java build/gen \
  --auto-add-overlay \
  build/compiled/res.zip

echo ">> generate build info"
mkdir -p src/com/actionables/app
cat > src/com/actionables/app/BuildInfo.java <<EOF
package com.actionables.app;
/** Generated at build time. */
public final class BuildInfo {
    public static final String APP_VERSION = "$APP_VERSION";
    public static final String WEB_COMMIT = "$WEB_COMMIT";
    private BuildInfo() {}
}
EOF

echo ">> javac"
javac -g:none -source 17 -target 17 -classpath "$PLAT" \
  -d build/obj \
  src/com/actionables/app/*.java build/gen/com/actionables/app/R.java

echo ">> d8 (dex)"
"$BT/d8" $(find build/obj -name '*.class') --lib "$PLAT" --min-api 24 --output build/apk/

echo ">> package"
cp build/apk/base.apk build/apk/unsigned.apk
( cd build/apk && zip -q unsigned.apk classes.dex )
( cd build/stage && zip -qr ../apk/unsigned.apk assets )

echo ">> verifying keystore is readable"
if ! keytool -list -keystore "$KEYSTORE" -storepass "$KS_PASS" >/dev/null 2>/tmp/kslist.err; then
  echo "ERROR: cannot open the keystore. This almost always means the"
  echo "KEYSTORE_BASE64 secret is incomplete/corrupt, or KEYSTORE_PASSWORD is wrong."
  echo "Fix: recopy ONLY the single base64 line between the BEGIN/END markers"
  echo "from the generator run into the KEYSTORE_BASE64 secret, then re-run."
  echo "---- keytool said: ----"
  cat /tmp/kslist.err
  echo "---- decoded keystore size: $(stat -c%s "$KEYSTORE" 2>/dev/null || echo 0) bytes ----"
  exit 1
fi

echo ">> zipalign"
"$BT/zipalign" -f -p 4 build/apk/unsigned.apk build/apk/aligned.apk

echo ">> sign"
mkdir -p "$(dirname "$OUT_APK")"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KS_PASS" \
  --key-pass "pass:$KEY_PASS" \
  --out "$OUT_APK" \
  build/apk/aligned.apk

echo ">> verify"
"$BT/apksigner" verify "$OUT_APK"
"$BT/aapt2" dump badging "$OUT_APK" | grep -E "package:|minSdk|targetSdk"
echo ">> DONE: $OUT_APK"
