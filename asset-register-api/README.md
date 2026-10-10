# Asset Register API

NestJS + TypeScript service foundation for the nationwide asset register. This package is intentionally separate from the frontend so releases, data access, and secrets can be managed independently.

## First slice

- `GET /api/v1/health` — checks service and database connectivity.
- OIDC bearer-token verification, organization membership resolution, and recursive location-scope authorization helpers for protected controllers.
- `database/migrations/001_initial_schema.sql` — tenant-scoped relational model for locations, assets, warranties, evidence metadata, verification cycles, idempotent scans, reports, transfers, audit events, and a notification outbox.
- `database/migrations/002_custody_history.sql` — accountable issue/return history for named custodians, including a backfill from existing asset custodian fields.
- `.env.example` — configuration names only; copy to a local ignored `.env` and never commit credentials.

No production write endpoint is exposed until the organization supplies its OIDC issuer and role provisioning. This is deliberate: the API must enforce Head Office, State Head, Centre Head, and custodian scope on the server, not trust a centre ID sent by the browser. The guards are covered by unit tests using locally signed test tokens and a local JWKS server.

## Local setup

Requires Node.js 24 LTS and PostgreSQL 16 or 17. Copy `.env.example` to `.env` and set `DATABASE_URL`. For a fresh database, run `npm run db:migrate` and then `npm run db:migrate:custody`. For an existing database, apply only the new migration with `npm run db:migrate:custody`. Install dependencies, then run `npm run start:dev`.

Run `npm test` for authentication, tenant-membership, location-scope, and PostgreSQL schema checks. The schema tests use an embedded PostgreSQL runtime and do not need a running database service.

The migrations are intentionally SQL-first so database constraints and tenant-safe composite foreign keys are explicit. NestJS uses the supported `pg` driver directly; domain modules keep queries visible and use prepared statements rather than hiding access rules in generated ORM behavior.

## Asset accountability additions

- A custody record is issued to an active custodian assigned to the asset's current location. Returns record the condition and notes. Only one open handover can exist for an asset, and each issue/return is also written to the audit timeline.
- Asset changes are recorded with before/after values. Classifying an item as missing, retired, or disposed requires a reason; missing/retired classifications require a centre/state/head-office manager, and only Head Office can dispose an asset. A disposed record cannot be reactivated through the normal edit endpoint. Transfer approval must come from someone other than the requester.
- `GET /api/v1/insights/alerts` returns scoped review signals for assets marked missing, assets unseen after a verification window, duplicate serial numbers, transfers open longer than seven days, and unresolved urgent reports. An overdue scan remains a review signal and is never promoted to a missing or stolen status automatically.
- `GET /api/v1/assets/:id/activity` combines asset edits, verification scans, related reports/transfers, custody, and warranty events. Results are limited to assets in the caller's authorized location scope.
- The Watch queue is currently in-app. Automated push, email, or messaging delivery requires a production scheduler and a notification provider; the seven-day stalled-transfer threshold should be configured by Head Office before the pilot.

## Centre directory

- `database/seeds/incuspaze-centre-directory.csv` is the import-ready version of the centre list supplied on 10 October 2026. Review its source notes in `database/seeds/README.md` before importing.
- Head Office can preview the CSV with `POST /api/v1/locations/import/preview` and import it with `POST /api/v1/locations/import`, passing the CSV text in `{ "csv": "..." }`. The import creates state, centre, and direct floor records in one transaction. Duplicate codes, missing states, and invalid parent references stop the import.
- Floors can be direct children of a centre or of a building. A city does not produce a map pin; exact centre coordinates remain unconfirmed until an authorized person verifies them.

## Production boundary

GitHub stores application source and reviewed migrations only. Asset data, employee data, invoices, camera images, QR secrets, and exports belong in the production database and private object storage. Uploads should use short-lived signed URLs; queued offline writes need stable client-generated IDs and server acknowledgement before being shown as centrally saved.
