# Production structure for a nationwide asset register

## Repository boundary

Keep the frontend in `asset-register-frontend/` and the backend in a separate service repository or deployable package. This repository is for source, migrations, configuration templates, and non-sensitive fixtures only. Do not commit live centre records, employee identities, invoices, camera captures, or production exports to GitHub.

## Suggested service layout

```text
asset-register-frontend/      Responsive web client / future PWA
asset-register-api/            Versioned API and business workflows (separate repo)
asset-register-worker/         Notifications, imports, reports, warranty reminders
infrastructure/                Deployment definitions and observability
```

Start with a modular API service and managed relational database; split services only when measured scale or operational ownership requires it. Use tenant-scoped records (`organization_id`) and explicit centre/state scope on every authorization decision. Keep the location hierarchy normalized: India → state → centre → building → floor → area. Centre managers can maintain internal and external locations inside their assigned centre; state and head-office roles receive wider scopes.

## Data and scale

- Use a managed PostgreSQL-compatible database as the system of record. Index tenant, centre, asset tag, serial number, status, and verification-cycle fields. Add cursor pagination and filtered aggregate endpoints for nationwide lists and maps. Start with tenant isolation and measured query plans; partition only when actual data volume and query patterns justify it.
- Store asset photos, invoices, and evidence in private object storage, never in Git. Use short-lived signed upload/download URLs, encryption, file-size/type limits, malware scanning, retention rules, and access audit records.
- Keep an append-only audit trail for asset creation, edits, scans, moves, approvals, damage reports, and missing classifications. Use idempotency keys for scan and transfer submissions so retries from weak mobile connections cannot duplicate actions.
- Support offline centre scans with an encrypted local queue, stable client-generated event IDs, visible sync state, retry/backoff, and explicit conflict handling. Do not claim a scan is saved centrally until the server acknowledges it.
- Use an outbox/worker pattern for notifications, warranty reminders, cycle close, exports, and long-running jobs. Notifications should be retried and auditable.
- Expose a versioned API contract to the frontend. Separate read endpoints optimized for maps/dashboards from write workflows; use server-side role checks on every endpoint, not only hidden UI controls.

## Delivery and recovery controls

- `.github/workflows/ci.yml` runs the API and web test suites and production builds on Node.js 24.21.0. A PostgreSQL 16 service job applies every migration and exercises archive creation, checksum verification, a non-production restore, and tamper rejection with synthetic data.
- API responses carry a UUID `x-request-id` so support can correlate a client report with infrastructure logs. Treat it as a diagnostic identifier only, never as identity or authorization evidence.
- `asset-register-api/scripts/backup-db.sh` creates a private custom-format PostgreSQL archive and SHA-256 sidecar outside the source tree. `restore-db.sh` verifies the digest, matches `RESTORE_TARGET_ENV` to a database-level `asset_register.environment` marker (`local` or `staging`), requires exact database-name confirmation, and should target a freshly created non-production database.
- Use managed encrypted backups, retention, and cross-region replication for production. The local scripts demonstrate archive restore behavior but do not replace provider snapshots, point-in-time recovery, access policies, or a production recovery exercise.

## Core backend modules

1. Identity, organizations, role assignments, and centre/state scopes.
2. Centre/location directory and geospatial coordinates with review status and source.
3. Asset register, QR identity, purchase evidence, warranty/guarantee coverage, and private media metadata.
4. Scan sessions and six-month verification cycles with configurable windows and escalation policy.
5. Transfer requests, handover evidence, approvals, and immutable movement history.
6. Condition reports, repair lifecycle, missing-asset investigation, and organization notifications.
7. Reporting/export jobs, audit search, and operational health metrics.

## Build sequence after UI review

1. Agree identity provider, tenancy model, data residency, retention, and offline requirements.
2. Define the relational schema and API contract from the reviewed screens.
3. Implement authentication, scoped authorization, centre/location setup, and audit events.
4. Add asset capture, QR issuance, private media uploads, and idempotent offline sync.
5. Add verification cycles, escalation, transfers, condition reports, and warranties.
6. Add large-scale maps/reports, observability, load checks, backups, and recovery procedures.

This architecture is a starting proposal, not a claim that the prototype is production-ready. Capacity targets, deployment region, identity provider, and retention policy should be agreed before implementation.
