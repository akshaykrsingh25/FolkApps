# IncuAsset frontend prototype

This is the standalone, responsive screen prototype for the India-wide asset register. It includes all 30 screen frames, the seeded centre directory, camera and QR capture flows, verification, map hierarchy, missing-asset review, condition reports, transfers, warranty tracking, and role views.

## Run locally

Open `index.html` in a modern browser. The UI, concept imagery, and SVG icons are bundled; no icon CDN is required. The India boundary layer currently loads from its referenced public dataset and therefore needs a network connection. The screen frames use sample data only.

## What is included

- `index.html` — accessible screen markup and sample images
- `styles.css` — responsive layout, touch targets, reduced-motion support, and print rules
- `app.js` — screen navigation, demo interactions, map rendering, and local SVG icons

This is a frontend prototype. Its sample interactions do not save organizational records, deliver notifications, print a production QR code, or access a live camera. Those actions need authenticated backend APIs and native/browser permissions.

## Demo asset catalog

`app.js` generates 300 demo assets (chairs, desks, monitors, network gear, AC units, printers, projectors, CCTV, fire/safety equipment, etc.) and distributes them across all 64 seeded active centres, so the Inventory, India map, centre directory, and per-centre stats all show consistent, non-trivial numbers instead of a handful of hand-written samples. It is seeded (deterministic), so counts are stable across reloads. Category thumbnails are either one of the three bundled real product photos (network switch, office chair, printer) or an original flat SVG illustration drawn in the Incuspaze palette — no external image requests are made, keeping the prototype fully offline-capable. Swap in real Pexels/vendor photography per category when wiring this up to production data.

## Production data boundary

GitHub stores this frontend source and reviewed sample fixtures. It must not store live asset records, employee data, invoices, QR identity secrets, or uploaded photos. Production data belongs in an authenticated service with a managed database and private object storage. See [`../docs/production-architecture.md`](../docs/production-architecture.md).


## Brand

Uses the supplied Incuspaze identity: official indigo (`#202344`) and orange (`#F37F20`), with teal (`#3B9F94`) as a supporting status color. The original wordmark artwork is included as `incuspaze-logo.png`. Typography prefers Montserrat with system fallbacks; Playfair is used sparingly for an editorial accent.
