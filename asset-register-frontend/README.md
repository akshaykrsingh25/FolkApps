# IncuAsset web app

React + TypeScript + Vite installable PWA shell for the India-wide asset register. The approved static screen design remains available at `/design-reference.html` while production screens are migrated into typed, testable feature modules.

## Local development

Requires Node.js 24 LTS. Copy `.env.example` to `.env.local`, configure the OIDC authority and client ID from the organization's identity provider, then run `npm install` and `npm run dev`. When no identity provider is configured the app intentionally shows a setup state and does not pretend to authenticate.

The SPA uses OIDC authorization code flow with PKCE through `oidc-client-ts`. Tokens and transient sign-in state are scoped to the browser session; the app does not write tokens or business records to GitHub. The PWA includes encrypted offline capture and verification queues, with explicit sync states.

Scoped CSV exports are requested from the Assets area. The UI shows queued/running/ready/expired status, allows queued work to be cancelled, and requests a short-lived download link only when the user chooses Download. In production, configure `VITE_ASSET_QR_PUBLIC_KEYS_JSON` with verification keys only; never include a QR signing private key in a web build.
