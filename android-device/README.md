# IncuAsset Android device edition

A signed, self-contained Android APK for Android 8.0 and later with a current Android System WebView. The app serves only its packaged assets from a secure local origin. It contains no server credentials or private signing keys. Runtime camera access is requested when the user starts the camera; microphone and unrelated WebView permission requests are refused.

The device edition supports local asset registration, individual QR identities and printing, photographs and invoices, conservative on-device category suggestions and OCR, local condition reports, physical floor walks, handover records, warranty records, India/state/centre navigation, schematic 3D building/floor exploration and area-linked asset lists. Its data is stored in the app on that device. Shared identity, organization approval enforcement, server notifications, vendor SLAs and ERP delivery require the production service and are not live in this APK.

## Build

Run `bash android-device/scripts/build-apk.sh` from the repository. The script uses the locally installed Android SDK and Android Studio JBR; override `ANDROID_SDK_ROOT`, `INCUASSET_JAVA_HOME` and `INCUASSET_KEY_DIRECTORY` as needed. The signing key and its password are stored outside the checkout and must remain private. Retain the signing key to install future updates without uninstalling and losing local records. The build output is `android-device/build/IncuAsset-Device.apk`.

## Verification

The repository's frontend tests cover persistence, idempotent registration, file storage, OCR parsing, photo-category filtering, scan buffering and offline queues. The isolated Android instrumentation package verifies launch, interface rendering, absence of demo branding and viewport fit. Build it with `bash android-device/scripts/build-checks.sh`; install the main APK and the checks APK on an emulator, then run the instrumentation class `com.incuspaze.assetregister.test/.LaunchChecks`. The checks APK is a test artifact and is not distributed with the main app.

Physical camera focus, lighting, lens quality, barcode readability and recognition accuracy vary by handset. The model gives reviewable suggestions for common office objects; it does not certify asset identity or ownership. The 3D view is schematic unless room geometry has been supplied; markers show area assignments, not measured indoor positions. Core phone-sized UI checks do not establish compatibility with every Android device.

## Data and installation

The Android package requests Internet capability for the WebView runtime, but its resource handler rejects external resource/navigation hosts in this edition. Models, OCR files, map boundaries, art and interface assets are bundled. No company cloud synchronization takes place. Photos and invoices can be exported through Android's document picker. The record backup includes structured inventory, floor walks, handovers and saved room layouts; images must be exported separately. Uninstalling or clearing app data removes local records. Use backups and preserve the signing key before distributing updates.
