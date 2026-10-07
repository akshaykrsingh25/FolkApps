# IncuAsset frontend prototype

Responsive 30-screen asset-register UI prototype for the India-wide centre network. Source and sample-only data live here; production asset records and uploaded images must live in authenticated backend storage, not GitHub.

## Files
- index.html — accessible screens, sample imagery, and device viewport metadata
- styles.css — mobile/tablet/desktop layout, touch targets, motion preferences, print layout
- app.js — screen switching, sample interactions, map rendering, and local SVG icon renderer

Open index.html in a modern browser. The India state-boundary layer requires a network connection. Prototype actions do not persist live data, send notifications, use a live camera, or issue production QR codes.

See ../docs/production-architecture.md for the proposed backend boundary and scale plan.