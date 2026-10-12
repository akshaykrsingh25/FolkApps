#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/../.." && pwd)"
android_sdk="${ANDROID_SDK_ROOT:-/Users/akshay/Library/Android/sdk}"
android_java="${INCUASSET_JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
android_tools="$android_sdk/build-tools/36.0.0"
android_platform="$android_sdk/platforms/android-35/android.jar"
build_root="$project_root/android-device/build"
key_root="${INCUASSET_KEY_DIRECTORY:-/Users/akshay/Documents/Codex/secure-artifact-keys}"
export JAVA_HOME="$android_java"
export PATH="$android_java/bin:$PATH"
mkdir -p "$build_root/classes" "$build_root/dex" "$key_root"
chmod 700 "$key_root"
if [ ! -f "$key_root/incuasset-device.password" ]; then
 python3 -c 'import secrets,sys;open(sys.argv[1],"w").write(secrets.token_urlsafe(36))' "$key_root/incuasset-device.password"
 chmod 600 "$key_root/incuasset-device.password"
fi
if [ ! -f "$key_root/incuasset-device.jks" ]; then
 keytool -genkeypair -keystore "$key_root/incuasset-device.jks" -storepass:file "$key_root/incuasset-device.password" -keypass:file "$key_root/incuasset-device.password" -alias incuasset-device -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=IncuAsset Device Edition' >/dev/null
 chmod 600 "$key_root/incuasset-device.jks"
fi
VITE_APP_MODE=device npm run build --prefix "$project_root/asset-register-frontend"
cp -R "$project_root/asset-register-frontend/dist/." "$project_root/android-device/assets/"
python3 - "$project_root/android-device/assets/index.html" <<'PYCODE'
import re,sys
p=sys.argv[1];s=open(p).read();s=re.sub(r'<script[^>]*src="[^"]*registerSW.js"[^>]*></script>','',s);open(p,'w').write(s)
PYCODE
javac -source 8 -target 8 -classpath "$android_platform" -d "$build_root/classes" "$project_root/android-device/src/com/incuspaze/assetregister/MainActivity.java"
find "$build_root/classes" -name '*.class' -print0 | xargs -0 "$android_tools/d8" --lib "$android_platform" --min-api 26 --output "$build_root/dex"
"$android_tools/aapt" package -f -M "$project_root/android-device/AndroidManifest.xml" -S "$project_root/android-device/res" -A "$project_root/android-device/assets" -I "$android_platform" -F "$build_root/unsigned.apk"
(cd "$build_root/dex" && zip -q "$build_root/unsigned.apk" classes.dex)
"$android_tools/zipalign" -f 4 "$build_root/unsigned.apk" "$build_root/aligned.apk"
"$android_tools/apksigner" sign --ks "$key_root/incuasset-device.jks" --ks-pass "file:$key_root/incuasset-device.password"  --ks-key-alias incuasset-device --out "$build_root/IncuAsset-Device.apk" "$build_root/aligned.apk"
"$android_tools/apksigner" verify --verbose "$build_root/IncuAsset-Device.apk"
