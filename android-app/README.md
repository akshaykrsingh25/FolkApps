# IncuAsset Android app (fully offline, bundled UI)

This is a native Android app that bundles the entire IncuAsset UI
(`app/src/main/assets/www/` — a copy of `asset-register-frontend/`) directly
inside the APK and loads it in a `WebView` from local assets
(`file:///android_asset/www/index.html`). **It does not fetch anything from
GitHub Pages, or any server, at runtime** — it has no dependency on GitHub
being up, reachable, or involved in any way once installed. Everything the
app needs ships inside the `.apk` file itself.

(An earlier version of this app was a Trusted Web Activity that loaded the
UI live from GitHub Pages. That approach is no longer used — this is a
completely self-contained app now.)

**Package ID:** `com.incuspaze.assetregister`

## Opening in Android Studio

1. Open this `android-app/` folder directly in Android Studio ("Open an
   existing project").
2. Let Gradle sync.
3. Hit Run for a debug build (no keystore needed) on a device/emulator.

## Signing a release build

**The signing keystore (`android.keystore`) is intentionally not committed
to this repo** — keystores should never go into version control, especially
a public one. It was sent to you separately as a file in the chat.

```
./gradlew assembleRelease \
  -PRELEASE_STORE_FILE=/absolute/path/to/android.keystore \
  -PRELEASE_STORE_PASSWORD=<password> \
  -PRELEASE_KEY_ALIAS=incuasset \
  -PRELEASE_KEY_PASSWORD=<password>
```

Or add those four properties to your own (never-committed)
`~/.gradle/gradle.properties`, or use Android Studio's Build > Generate
Signed Bundle/APK wizard pointed at the keystore file.

If you don't have the keystore, generate a **new** one instead of trying to
recover it — but note that an update must be signed with the *same* key as
whatever's already installed on a device, so once you pick a real key, keep
it safe and back it up. For distributing beyond ad-hoc testing, consider
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
on the Play Console, which manages the real release key for you.

## Updating the app after UI changes

Unlike the earlier GitHub-Pages-backed version, UI changes made in
`asset-register-frontend/` are **not** automatically reflected here — since
nothing is fetched live, the UI has to be re-copied into the app and the
APK rebuilt. After changing anything in `asset-register-frontend/`:

```
cp asset-register-frontend/{index.html,app.js,styles.css,manifest.webmanifest,service-worker.js} \
   android-app/app/src/main/assets/www/
cp -r asset-register-frontend/icons android-app/app/src/main/assets/www/
```

Then rebuild and re-sign as above.

## What still needs network access

Nothing required — the app works fully offline. Two decorative/optional
things still reach out to the internet when available, and degrade
gracefully without it:
- The Google Fonts stylesheet linked in `index.html`'s `<head>` (falls back
  to system fonts if unreachable).
- Nothing else — all data in the app (the demo asset catalog, centres,
  etc.) is simulated/seeded locally in `app.js`, same as the web version.

## Real camera, real data, real login

This app is still a **UI/UX prototype with simulated data** — see
`asset-register-frontend/README.md`. The `CAMERA` permission is already
declared and `WebView` is configured to grant camera access to the page on
request, so wiring up real `getUserMedia()`-based QR/barcode scanning in
the web UI would work here without any native code changes. Real data
persistence and real login need a backend (not included) — ask to scope
that separately when you're ready for it.
