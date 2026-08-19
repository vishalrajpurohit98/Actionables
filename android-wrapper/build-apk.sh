#!/usr/bin/env bash
# Build Personal Tracker (HabitTracker) web app into a signed APK
# using only Android SDK command-line tools. Run from android-wrapper/.
set -euo pipefail

BUILD_TOOLS_VER="${BUILD_TOOLS_VER:-35.0.0}"
PLATFORM_VER="${PLATFORM_VER:-android-34}"
WEB_DIR="${WEB_DIR:-..}"
OUT_APK="${OUT_APK:-build/PersonalTracker.apk}"
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
rsync -a \
  --exclude '.git' --exclude '.github' --exclude 'android-wrapper' \
  --exclude 'node_modules' --exclude '*.apk' \
  "$WEB_DIR"/ build/stage/assets/
test -f build/stage/assets/index.html || { echo "ERROR: index.html not found in $WEB_DIR"; exit 1; }

MANIFEST="AndroidManifest.xml"
if [ -n "${VERSION_CODE:-}" ] || [ -n "${VERSION_NAME:-}" ]; then
  echo ">> applying version overrides (code=${VERSION_CODE:-unchanged} name=${VERSION_NAME:-unchanged})"
  cp AndroidManifest.xml build/AndroidManifest.xml
  if [ -n "${VERSION_CODE:-}" ]; then
    sed -i "s/android:versionCode=\"[^\"]*\"/android:versionCode=\"${VERSION_CODE}\"/" build/AndroidManifest.xml
  fi
  if [ -n "${VERSION_NAME:-}" ]; then
    sed -i "s/android:versionName=\"[^\"]*\"/android:versionName=\"${VERSION_NAME}\"/" build/AndroidManifest.xml
  fi
  MANIFEST="build/AndroidManifest.xml"
fi

echo ">> aapt2 compile resources"
"$BT/aapt2" compile --dir res -o build/compiled/res.zip

echo ">> aapt2 link"
"$BT/aapt2" link \
  -o build/apk/base.apk \
  -I "$PLAT" \
  --manifest "$MANIFEST" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --java build/gen \
  --auto-add-overlay \
  build/compiled/res.zip

echo ">> javac"
javac -g:none -source 17 -target 17 -classpath "$PLAT" \
  -d build/obj \
  src/com/personaltracker/app/*.java build/gen/com/personaltracker/app/R.java

echo ">> d8 (dex)"
"$BT/d8" $(find build/obj -name '*.class') --lib "$PLAT" --min-api 24 --output build/apk/

echo ">> package"
cp build/apk/base.apk build/apk/unsigned.apk
( cd build/apk && zip -q unsigned.apk classes.dex )
( cd build/stage && zip -qr ../apk/unsigned.apk assets )

echo ">> verifying keystore is readable"
if ! keytool -list -keystore "$KEYSTORE" -storepass "$KS_PASS" >/dev/null 2>/tmp/kslist.err; then
  echo "ERROR: cannot open the keystore. KEYSTORE_PASSWORD wrong, or keystore.b64 corrupt."
  cat /tmp/kslist.err
  echo "decoded keystore size: $(stat -c%s "$KEYSTORE" 2>/dev/null || echo 0) bytes"
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
