# IncuAsset Android app (Trusted Web Activity)

This is a native Android wrapper around the live prototype hosted at
[akshaykrsingh25.github.io/FolkApps](https://akshaykrsingh25.github.io/FolkApps/),
built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (a
Trusted Web Activity / TWA project). It's a thin native shell — the actual
UI is the same web app in `asset-register-frontend/`, loaded from the live
GitHub Pages URL.

**Package ID:** `com.incuspaze.assetregister`

## Opening in Android Studio

1. Open this `android-app/` folder directly in Android Studio ("Open an
   existing project").
2. Let Gradle sync — it will download the Android Gradle Plugin and
   dependencies from Google's and Maven Central's repositories.
3. To run a debug build on a device/emulator, just hit Run. A debug build
   doesn't need the release keystore.

## Signing a release build

**The signing keystore (`android.keystore`) is intentionally not committed
to this repo** — keystores should never go into version control, especially
a public one. It was sent to you separately (as a file in the chat) the
first time this was built.

To build a signed release APK from the command line:

```
./gradlew assembleRelease \
  -PRELEASE_STORE_FILE=/absolute/path/to/android.keystore \
  -PRELEASE_STORE_PASSWORD=<password> \
  -PRELEASE_KEY_ALIAS=incuasset \
  -PRELEASE_KEY_PASSWORD=<password>
```

Or add those four properties to your own (never-committed)
`~/.gradle/gradle.properties` so you don't need to pass them every time, or
to Android Studio's Build > Generate Signed Bundle/APK wizard directly
(point it at the keystore file).

If you don't have the keystore sent earlier, generate a **new** one instead
of trying to recover it — for app updates to install over an existing
install, the new APK must be signed with the same key as what's already on
the device, so once you pick a real signing key, keep it safe and back it
up. For anything beyond testing with your team, consider using
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
on the Play Console, which manages the real release key for you.

## Known limitation: the address bar

Because this app is hosted at `akshaykrsingh25.github.io/FolkApps/` (a
project path under GitHub's own shared domain, not a domain you control the
root of), Digital Asset Links verification (`/.well-known/assetlinks.json`
at the domain *root*) isn't possible from this repo alone — GitHub's domain
root isn't under this repo's control. Without that verification, the TWA
falls back to a Custom Tabs-style view with a thin address bar shown at the
top, instead of a fully "chromeless" native look.

To remove the address bar entirely, either:
- Point a custom domain you own at the GitHub Pages site, and publish
  `assetlinks.json` at that domain's root, or
- Host the web app at the root of a domain you control outright (e.g. a
  `username.github.io` *user* page instead of a project page, if you don't
  already have one).

Then update `twaManifest.host`/`hostName` here to match, and rebuild.

## Updating the app after UI changes

The app always loads from the live URL — most UI changes to
`asset-register-frontend/` need no Android rebuild at all, since the TWA is
just a thin wrapper. You only need to rebuild and re-sign here when you
change:
- the app's package ID, name, icon, splash/theme colors, or
- anything in `twa-manifest.json` / `app/build.gradle`'s `twaManifest` block.

If you do change those, after editing `twa-manifest.json` you can
regenerate the Android project files with Bubblewrap itself
(`npx @bubblewrap/cli update`) instead of hand-editing `app/build.gradle`.
