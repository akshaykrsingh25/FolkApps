#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/../.." && pwd)"
android_sdk="/Users/akshay/Library/Android/sdk"
export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
export PATH="$JAVA_HOME/bin:$PATH"
tools="$android_sdk/build-tools/36.0.0"
keys='/Users/akshay/Documents/Codex/secure-artifact-keys'
build="$project_root/android-device/build/checks"
mkdir -p "$build/classes" "$build/dex"
javac -source 8 -target 8 -classpath "$android_sdk/platforms/android-35/android.jar" -d "$build/classes" "$project_root/android-device/tests/com/incuspaze/assetregister/test/LaunchChecks.java"
find "$build/classes" -name '*.class' -print0 | xargs -0 "$tools/d8" --lib "$android_sdk/platforms/android-35/android.jar" --min-api 26 --output "$build/dex"
"$tools/aapt" package -f -M "$project_root/android-device/tests/AndroidManifest.xml" -I "$android_sdk/platforms/android-35/android.jar" -F "$build/unsigned.apk"
(cd "$build/dex" && zip -q "$build/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$build/unsigned.apk" "$build/aligned.apk"
"$tools/apksigner" sign --ks "$keys/incuasset-device.jks" --ks-pass "file:$keys/incuasset-device.password" --out "$build/checks.apk" "$build/aligned.apk"
