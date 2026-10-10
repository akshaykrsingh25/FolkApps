# Asset Register API

NestJS + TypeScript service foundation for the nationwide asset register. This package is intentionally separate from the frontend so releases, data access, and secrets can be managed independently.

## First slice

- `GET /api/v1/health` — checks service and database connectivity.
- OIDC bearer-token verification, organization membership resolution, and recursive location-scope authorization helpers for protected controllers.
- `database/migrations/001_initial_schema.sql` — tenant-scoped relational model for locations, assets, warranties, evidence metadata, verification cycles, idempotent scans, reports, transfers, audit events, and a notification outbox.
- `.env.example` — configuration names only; copy to a local ignored `.env` and never commit credentials.

No production write endpoint is exposed until the organization supplies its OIDC issuer and role provisioning. This is deliberate: the API must enforce Head Office, State Head, Centre Head, and custodian scope on the server, not trust a centre ID sent by the browser. The guards are covered by unit tests using locally signed test tokens and a local JWKS server.

## Local setup

Requires Node.js 24 LTS and PostgreSQL 16 or 17. Copy `.env.example` to `.env`, create a local database, apply `database/migrations/001_initial_schema.sql` with `psql`, install dependencies, then run `npm run start:dev`.

Run `npm test` for authentication, tenant-membership, location-scope, and PostgreSQL schema checks. The schema tests use an embedded PostgreSQL runtime and do not need a running database service.

The initial migration is intentionally SQL-first so database constraints and tenant-safe composite foreign keys are explicit. NestJS uses the supported `pg` driver directly for this first slice; domain modules can keep queries visible and use prepared statements rather than hiding access rules in generated ORM behavior.

## Production boundary

GitHub stores application source and reviewed migrations only. Asset data, employee data, invoices, camera images, QR secrets, and exports belong in the production database and private object storage. Uploads should use short-lived signed URLs; queued offline writes need stable client-generated IDs and server acknowledgement before being shown as centrally saved.
