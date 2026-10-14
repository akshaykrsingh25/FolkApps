# IncuAsset — App Framework & Spec (A–Z)

One document that explains what this app is, every screen in it, the design
system behind it, the data it works with, and how the Android project is
wired — so Android Studio (and whoever opens it there) has full context
without having to reverse-engineer `app.js`.

This describes the **current prototype** (simulated data, no backend) as it
exists in `asset-register-frontend/` and is bundled into the Android app at
`android-app/app/src/main/assets/www/`. Where something is a known gap for a
"real" production version, it's called out under **Known gaps / not real yet**.

---

## 1. What the app is

**IncuAsset** is an India-wide, multi-centre physical **asset register** for
Incuspaze (a coworking/incubation operator). Field staff walk a building
floor-by-floor, scan or photograph each physical asset (furniture, IT
equipment, appliances, etc.), and the app builds a record per asset: what it
is, which centre/building/floor/space it lives in, its condition, warranty,
and verification history. Managers review, approve moves, run periodic
verification cycles, and track assets reported missing or unused across the
whole portfolio on an India map.

Three roles exist today (`roles` screen):
| Role | Scope |
|---|---|
| **Admin** | Full register + people access — manage roles, approve, edit register |
| **Manager** | Review changes in assigned sites — approve, move assets, verify |
| **Recorder** | Capture and verify assigned assets — add asset, capture, report issue |

---

## 2. Navigation model

It's a **single-page app**: one `index.html`, ~35 `<section class="screen" data-screen="...">` blocks, all hidden except the active one. `app.js`'s `showScreen(name)` toggles which one is visible — there is no browser routing/URL state, no Activities/Fragments (that's the native wrapper's job, see §7).

A screen-picker `<select>` at the top (`#screen-picker`) exists only for prototype review — it's how you jump directly to any of the 35 screens without walking the real flow. **Remove it (or guard it behind a debug flag) before anything resembling a production build** — it's a developer/demo convenience, not a user-facing control.

### Bottom navigation (always visible, 5 items)
```
[ Today ]   [ Map ]   [ Assets ]   ((  Scan  ))   [ Verify ]   [ Reports ]
  home      map-india  inventory    scanner        verification  reports
```
The **Scan** button (`.scan-fab`) is the centered, raised FAB — it's the primary action of the whole app. It was deliberately centered (not edge-aligned) because scanning/capturing a new asset is the single most frequent action a field user takes.

### Full screen inventory (35 screens)

| # | `data-screen` | Purpose |
|---|---|---|
| 1 | `home` | Floor walk — today's capture session, floor/space progress |
| 2 | `add-space` | Name a new space while walking a floor |
| 3 | `move-to-space` | Move captured assets into a named space |
| 4 | `scanner` | **Scan & capture** — camera/QR/RFID capture, continuous multi-capture |
| 5 | `add-asset` | Review a newly captured asset before saving |
| 6 | `batch-review` | Review multiple captures from one session at once |
| 7 | `missing-assets` | Org-wide "haven't been seen" watch list |
| 8 | `reports` | Damage/repair report register |
| 9 | `asset-report` | File a new condition/issue report against an asset |
| 10 | `inventory` | Full asset list, filterable |
| 11 | `asset-detail` | One asset's full record + history |
| 12 | `locations` | Locations browser |
| 13 | `verification` | Periodic verification cycle (confirm assets still exist) |
| 14 | `movement` | Move one asset between locations |
| 15 | `approvals` | Manager approval queue |
| 16 | `audit` | Activity/audit log |
| 17 | `roles` | Roles & access (Admin/Manager/Recorder) |
| 18 | `sign-in` | Sign-in screen |
| 19 | `map-india` | India-wide map — all active centres |
| 20 | `centre-directory` | List of active centres |
| 21 | `centre-manager` | Manage one centre's floors/assets (has its own **Scan** button) |
| 22 | `map-state` | Drill into one state → its cities |
| 23 | `map-city` | Drill into one city → its buildings |
| 24 | `map-building` | One building's 3D floor stack |
| 25 | `map-centre` | One centre's floor overview |
| 26 | `map-area` | One floor/area's asset list |
| 27 | `unused-map` | Map of underused/idle assets |
| 28 | `transfer-review` | Review an asset transfer/handover |
| 29 | `cycle-control` | HQ-level controls for scan/verification cycles |
| 30 | `purchase-capture` | Capture a purchase bill + product together |
| 31 | `warranties` | Warranty/guarantee tracker list |
| 32 | `warranty-detail` | One warranty's details + vendor contacts |
| 33 | `camera-match` | Camera-based product ID + "similar items" match |
| 34 | `qr-label` | Generated QR label preview + print options |
| 35 | `printer-connect` | Connect a label printer (Wi-Fi/Bluetooth/USB) |

---

## 3. Core user flows (UX)

### 3.1 Capture flow (the main loop)
`scanner` → capture one or more assets (camera photo / QR scan / RFID tap) →
**does not force navigation after each capture** — user can keep capturing
back-to-back (continuous multi-asset capture) → `batch-review` (if >1
pending) or `add-asset` (single) → fill in/confirm details → save → `qr-label`
(auto-generated) → optionally print immediately → back to `scanner` to keep
walking the floor, or `move-to-space` / `add-space` to organize what was just
captured.

**Capture modes**, selectable via `.capture-mode` buttons on the `scanner`
screen:
- **Camera** — photograph the asset
- **QR / barcode** — scan an existing tag
- **RFID** — tap an RFID-tagged asset (optional tag field on the asset
  record). Important UX note already baked into the copy: *"RFID speeds up
  bulk scanning once tagged, but the printed label is always a QR code — RFID
  chips can't be printed from this device."* RFID is an input/identification
  method, not a print format.

### 3.2 Labeling & printing flow
After an asset is saved, `qr-label` shows the generated QR + asset
name/code. Controls:
- **Label size** (`#label-size-select`) — six options, each mapped to a
  literal printer command string shown live (`#label-size-cmd`):
  | Option | Printer command |
  |---|---|
  | 50 × 30 mm *(default/recommended)* | `50 × 30 mm` |
  | 1.5 × 1.5 in · square QR tag | `1.5in × 1.5in (38 × 38 mm)` |
  | 1 × 1 in · small asset tag | `1in × 1in (25 × 25 mm)` |
  | 2 × 1 in · wide label | `2in × 1in (51 × 25 mm)` |
  | 40 × 25 mm | `40 × 25 mm` |
  | A4 sheet · 24 labels | `A4, 24-up` |
- **Number of copies** — stepper, default 1.
- **Include asset name/code below QR** — checkbox, default on.
- **Auto-print toggle** (`#auto-print-toggle`) — *"one click, one print"*.
  When checked, printing fires automatically as soon as the asset is saved,
  skipping the manual "Print label" tap. State persists across sessions via
  `localStorage["incuasset-auto-print"]` (`"1"`/`"0"`).
- **Printer: not connected / connected** row → leads to `printer-connect`.

### 3.3 Printer connection flow
`printer-connect` has a 3-way segmented control: **Wi-Fi** (default
selected) / **Bluetooth** / **Other**. "Other" explicitly covers USB-connected
print stations and shared network print queues. Selecting a mode triggers a
simulated device scan (`#printer-scan-text`, e.g. "Searching for Wi-Fi
printers on this network…") and populates `#printer-device-list`.

### 3.4 Verification cycle
Periodic re-confirmation that assets still physically exist where recorded.
`verification` (field-level, walk-and-confirm) feeds into `cycle-control`
(HQ-level: schedule/monitor cycles across all centres) and `missing-assets`
(anything not confirmed gets flagged org-wide).

### 3.5 Approvals
Certain actions (moves, new-asset edits, reports) go through `approvals` —
a Manager/Admin review queue — before they're final. `audit` keeps a
permanent log of what happened and who did it.

### 3.6 Map drill-down (India → State → City → Building → Floor → Area)
`map-india` → tap a state → `map-state` (cities in that state) → tap a city
→ `map-city` (buildings) → `map-building` (3D floor stack) → tap a floor →
`map-centre` / `map-area` (assets on that floor). Mirrors the physical
real-world hierarchy 1:1 — this is intentional; don't flatten it.

---

## 4. Design system

All design tokens live as CSS variables in `styles.css` (`:root`), scoped
under `#asset-register-prototype`.

### Colors
| Token | Hex | Role |
|---|---|---|
| `--ink` | `#202344` | Primary text |
| `--muted` | `#62677F` | Secondary text |
| `--primary` | `#202344` | Primary actions/brand (dark navy-ink) |
| `--on-primary` | `#FFFFFF` | Text/icons on primary |
| `--primary-soft` | `#F0F0F5` | Primary tint background |
| `--secondary` | `#1F7A43` | Success/positive (green) |
| `--secondary-soft` | `#E4F3EA` | Green tint background |
| `--tertiary` | `#F37F20` | Highlight/attention (orange) — also used for eyebrow labels |
| `--tertiary-soft` | `#FFF0E3` | Orange tint background |
| `--accent` | `#5B4B9E` | Accent (purple) |
| `--accent-soft` | `#EFEAFB` | Purple tint background |
| `--danger` | `#C0392F` | Errors/destructive (red) |
| `--danger-soft` | `#FBE7E4` | Red tint background |
| `--surface` | `#FFFFFF` | Card/sheet background |
| `--surface-low` | `#F5F5F6` | Page background |
| `--outline` | `#C9C9CE` | Borders |
| `--divider` | `#E6E6E9` | Hairline separators |

### Typography
- **Body/UI font**: Montserrat (`--font-body`), falls back to Arial.
- **Monospace/numeric font**: also Montserrat in practice (`--font-mono`),
  used with `font-variant-numeric: tabular-nums` for asset codes, counters,
  stats, ring-gauge labels — so digits align in columns.
- **Headings/buttons** (`.primary-button`, `.nav-tab`, `.scan-fab`, etc.):
  "Avenir Next" → Avenir → Inter → Segoe UI fallback chain.
- **Hero subhead**: Playfair (serif, italic) — the only serif/italic use in
  the app, reserved for one decorative subhead style.
- **Eyebrow labels** (small caps-style section tags like "ASSET REGISTER"):
  `"SFMono-Regular", Consolas, monospace`, 10px, letter-spacing 1.2px, colored
  `--tertiary` (orange).
- Loaded via Google Fonts `<link>` in `index.html`'s `<head>` — this is the
  **only** external network call the whole app makes, and it degrades
  gracefully to system fonts if unreachable (relevant for the offline
  Android build — see §7).

### Key component classes
- `.primary-button` / `.secondary-button` / `.text-action` — button hierarchy.
- `.scan-fab` — the centered, raised bottom-nav scan button.
- `.nav-tab` — bottom nav item.
- `.capture-mode` — camera/QR/RFID mode toggle on the scanner screen.
- `.icon-button` — small icon-only tap target (header actions).
- `.screen-title-row`, `.eyebrow`, `.page-title`, `.subhead` — standard
  screen header pattern used on nearly every screen.
- `.role-card`, `.permission-chips` — roles screen.
- `.printer-device-list`, `.printer-scan-status`, `.segmented` — printer flow.
- `.qr-sample`, `.qr-label-preview`, `.label-options` — QR label screen.
- `.ring-gauge` — SVG progress ring (used for floor/verification progress).
- `.map-screen` — shared layout for all map-drill-down screens.
- Icons are **Lucide** icons, rendered via a custom `renderIcons()` in
  `app.js` that reads `data-lucide="<name>"` attributes and injects inline
  SVG — not the `lucide` npm/CDN runtime directly, but a local icon-markup
  lookup table (`iconMarkup`), so there's a fixed, known set of icon names
  used — grep `data-lucide="` in `index.html` to see exactly which icons are
  needed if porting to native Android icon assets.

---

## 5. Data model (currently simulated/in-memory — see §6)

Nothing here is persisted to a real database yet; `app.js` seeds everything
in-memory from fixed arrays/generators on load.

**Asset** (per the `add-asset` / `asset-detail` / `qr-label` screens):
- `code` — human asset code, e.g. `IT-00482` (format: `<DEPT>-<5-digit>`)
- `name` — e.g. "Network switch"
- `qrCode` / `barcode` — e.g. `QR-IT-00482`
- `rfidTag` — optional
- `location` — building / floor / space, e.g. "Building A · Floor 4"
- `photos[]` — one or more captured images (`capture-strip` shows "3
  captures attached: asset photo · invoice · QR / product label" as the
  pattern — a single asset can carry **multiple** capture types, not just
  one photo)
- `condition` / reports — linked via `reports` / `asset-report`
- `warranty` — linked via `warranties` / `warranty-detail`
- `history` — audit trail of moves/verifications, shown on `asset-detail`

**Centre** — generated with a deterministic per-centre asset count:
`assets = 14 + (seed % 26)` (so each centre shows 14–39 assets). Centres are
grouped by `state` (`stateNames` = distinct states across all centres),
drilling down to city → building → floor.

**Role** — `{ name, icon, description, count, permissionChips[] }` — see the
roles table in §1.

**Label size** — `{ displayLabel, printerCommand }` pairs, listed in §3.2.

---

## 6. Settings / persisted state

The **only** state persisted today is in `localStorage`, scoped per-device
(not synced anywhere):

| Key | Values | Meaning |
|---|---|---|
| `incuasset-auto-print` | `"1"` / `"0"` | Auto-print toggle on the QR label screen |

Everything else — which asset is "active", which screen is open, captured
photos, filter text, printer "connection" state, the screen-picker dropdown —
lives only in JS variables / the DOM for the current page load and is lost
on refresh. That's expected for a prototype; a real build needs an actual
persistence layer (see Known gaps below).

---

## 7. How this maps to the Android Studio project

```
android-app/
├── app/
│   ├── src/main/
│   │   ├── java/com/incuspaze/assetregister/
│   │   │   └── MainActivity.java      ← entire native layer: one WebView
│   │   ├── assets/www/                ← the ENTIRE web app, bundled into the APK
│   │   │   ├── index.html             ← copy of asset-register-frontend/index.html
│   │   │   ├── app.js                 ← copy of asset-register-frontend/app.js
│   │   │   ├── styles.css
│   │   │   ├── manifest.webmanifest
│   │   │   ├── service-worker.js
│   │   │   └── icons/
│   │   ├── AndroidManifest.xml        ← CAMERA permission, single launcher Activity
│   │   └── res/                       ← app icon (mipmap), empty strings.xml
│   └── build.gradle                   ← applicationId com.incuspaze.assetregister
├── build.gradle / settings.gradle / gradlew
└── README.md                           ← build/sign/update instructions
```

- **`MainActivity`** is the *entire* native app: it creates one `WebView`,
  enables JS + DOM storage, grants camera permission to the page on request
  (for future `getUserMedia()`-based real scanning), and loads
  `file:///android_asset/www/index.html`. Android's hardware back button is
  wired to the WebView's history (`webView.goBack()`), not to Activity
  back-stack — because there's only ever one Activity.
- There is **no native navigation** (no Fragments/Navigation Component/Jetpack
  Compose screens) — all 35 "screens" are DOM sections inside that one
  WebView, controlled entirely by `app.js`'s `showScreen()`. Android Studio
  will show you one Activity and a web app — that's correct, not a bug.
- **Fully offline**: everything the app needs ships inside the `.apk`. The
  only thing that ever reaches the network is the optional Google Fonts
  `<link>`, and it fails silently to system fonts if there's no connection.
  There is no runtime dependency on GitHub, GitHub Pages, or any server.
- **Updating the UI**: because nothing is fetched live, changing
  `asset-register-frontend/` does **not** automatically change the app.
  After editing the web prototype, re-copy the changed files into
  `app/src/main/assets/www/` and rebuild. See `android-app/README.md` for
  the exact copy commands and signing instructions (same keystore as
  previous builds, so new builds install as updates, not fresh installs).
- **Permissions**: `CAMERA` is declared (`uses-feature
  android.hardware.camera` is `required="false"`, so the app still installs
  on devices without a camera). No other permissions are requested — no
  network, no storage, no RFID/NFC hardware permission yet (real RFID
  scanning would need `android.permission.NFC` + a `NfcAdapter` bridged into
  the WebView via a JS interface — not wired up yet).

---

## 8. Known gaps / not real yet

Everything below is simulated for the prototype and intentionally **not**
built — call these out explicitly if briefing anyone else on the project, so
nobody assumes they already work:

- **Camera & QR/barcode capture — now real.** The `scanner` screen uses a real
  `getUserMedia()` video feed (front/back switchable) and a bundled `jsQR`
  decoder (`vendor/jsQR.js`, vendored from npm so it still works fully
  offline). In **Scan code** mode it continuously decodes frames and, on a
  match, auto-fills the asset's QR/barcode field and opens the matching
  record. In **Photo** mode the shutter captures a real frame from the live
  video (not a placeholder) and attaches it to the new-asset capture. If the
  browser/WebView denies camera access (or there's no camera), it falls back
  to the static concept image and shows the "Allow camera" banner — same UX,
  just not live. **RFID is still simulated** — real RFID needs a native NFC
  bridge (`android.permission.NFC` + `NfcAdapter`, exposed to the WebView via
  `addJavascriptInterface`), which is a native change, not a web one.
- **Printer connection** — the Wi-Fi/Bluetooth/USB device list and "printing"
  are simulated; no real print job is ever sent to a real label printer.
  Real printing would need a native Android print/Bluetooth-SPP or
  network-socket bridge exposed to the WebView via `addJavascriptInterface`.
- **Data persistence** — everything except the one auto-print toggle resets
  on reload. No real database (local SQLite/Room, or a backend like
  Supabase) is wired up yet. This was discussed and intentionally paused —
  resume only when explicitly asked.
- **Login/accounts** — `sign-in` screen exists visually; there's no real
  authentication, session, or per-user identity behind it.
- **Multi-device sync** — since there's no backend, nothing captured on one
  phone is visible on another. Every device is its own island.
- **The `#screen-picker` dropdown** — developer/demo-only navigation
  shortcut; strip it out of anything meant for real end users.
