# Asset Register API

NestJS + TypeScript service foundation for the nationwide asset register. This package is intentionally separate from the frontend so releases, data access, and secrets can be managed independently.

## First slice

- `GET /api/v1/health` — checks service and database connectivity.
- OIDC bearer-token verification, organization membership resolution, and recursive location-scope authorization helpers for protected controllers.
- `database/migrations/001_initial_schema.sql` — tenant-scoped relational model for locations, assets, warranties, evidence metadata, verification cycles, idempotent scans, reports, transfers, audit events, and a notification outbox.
- `database/migrations/002_custody_history.sql` — accountable issue/return history for named custodians, including a backfill from existing asset custodian fields.
- `database/migrations/003_ownership_and_transfer_batches.sql` — asset ownership classification and tenant-scoped, multi-asset transfer manifests with per-item receipt discrepancies.
- `database/migrations/004_scoped_rbac_and_user_profiles.sql` — user contact fields, duplicate-grant protection, and a role-to-permission matrix.
- `database/migrations/005_dual_asset_identifiers.sql` — optional tenant-unique RFID EPCs on assets and identification method on every scan event.
- `database/migrations/006_background_asset_exports.sql` — background CSV export jobs, retry leases, short retention, and least-privilege `asset:export` grants.
- `database/migrations/007_rfid_binding_history.sql` — tenant-scoped RFID binding history, retirement reasons, and protection against EPC reuse.
- Asset labels can use tenant-bound Ed25519 signatures. The private signing key remains server-side; the public verification key is distributed to the web client for offline checks.
- The dual-identifier software boundary and its hardware pilot plan are documented in `docs/hybrid-identification-pilot.md`. RFID reader, tag writer, printer, and portal hardware are not connected by the current web application.
- `.env.example` — configuration names only; copy to a local ignored `.env` and never commit credentials.

Production access uses the configured OIDC provider. The app does not issue local passwords, store password hashes, or create a second JWT/MFA system. After authentication, the API resolves the OIDC subject to an active organization user and checks that user's scoped roles and permission grants on each protected route.

## Local setup

Requires Node.js 24 LTS and PostgreSQL 16 or 17. Copy `.env.example` to `.env` and set `DATABASE_URL`. For a fresh database, run `npm run db:migrate`. For a database already through migration 006, run `npm run db:migrate:rfid-binding-history`; databases through migration 005 must apply migration 006 before 007. Install dependencies, then run `npm run start:dev`.

Run `npm test` for authentication, tenant-membership, location-scope, and PostgreSQL schema checks. The schema tests use an embedded PostgreSQL runtime and do not need a running database service.
Run `npm run test:recovery` against two disposable PostgreSQL 16 databases to exercise all migrations, checksummed backup, restore, and tamper rejection. The CI workflow runs this drill with synthetic data.

## Database backup and restore exercise

- Create a custom-format archive outside the worktree with `npm run db:backup -- /secure/backup/path`, after supplying `DATABASE_URL` from the operator's secret manager. The command writes a SHA-256 sidecar and restricts both files to the current user. Supply a durable, access-controlled backup path; production retention and cross-region copies belong in the managed database backup policy.
- Before a restore, mark the isolated target database itself with `ALTER DATABASE <database_name> SET asset_register.environment = 'staging'` (or `local` for a local drill). Restore only into a freshly created, isolated non-production database with `npm run db:restore -- /secure/backup/path/asset-register-<timestamp>-<digest>.dump`, after supplying matching `RESTORE_TARGET_ENV` and `RESTORE_DATABASE_URL` from the operator's secret manager. The checksum and database environment marker are verified, and the script requires the exact target database name before restoring. PostgreSQL replaces matching objects from the archive; unrelated objects already in the target are not removed, so start with a fresh target for a full restore exercise. It refuses production and mismatched/missing environment markers.
- Use the restore exercise to verify schema and representative synthetic records, then record duration, recovery point, and recovery time against the organization's targets. Keep credentials in the operator's secret manager or shell environment, never in command history or Git.

## User administration and permissions

- `GET /api/v1/users` returns users whose role assignments are visible in the caller's location hierarchy. Head Office sees the organization; a State Head sees their state descendants; a Centre Head sees their centre descendants.
- `POST /api/v1/users` links an existing OIDC subject to the supplied email/name and grants a role at a location scope. The user must already exist in the identity provider; this endpoint does not create an identity-provider account, send an invitation, or issue credentials.
- `PATCH /api/v1/users/:id/active` pauses or restores access for a user in the caller's manageable scope. A manager cannot deactivate their own account, and organization status changes are serialized to prevent concurrent removal of all active Head Office access.
- State Heads can manage Centre Heads and lower roles in their state; Centre Heads can manage custodians and viewers in their centre. They cannot pause peers or higher-level users.
- Roles use the app's canonical names: `head_office`, `state_head`, `centre_head`, `asset_custodian`, and `viewer`. Custodians must be scoped to a floor or area; viewers are read-only. Permission strings are stored in `permissions` and `role_permissions`; route guards check them alongside location and workflow rules.
- Provisioning, MFA policy, credential lifecycle, and account recovery remain the identity provider's responsibility. Administrators must use the exact OIDC `sub` value when linking a work account.

The migrations are intentionally SQL-first so database constraints and tenant-safe composite foreign keys are explicit. NestJS uses the supported `pg` driver directly; domain modules keep queries visible and use prepared statements rather than hiding access rules in generated ORM behavior.

## Asset accountability additions

- A custody record is issued to an active custodian assigned to the asset's current location. Returns record the condition and notes. Only one open handover can exist for an asset, and each issue/return is also written to the audit timeline.
- Asset changes are recorded with before/after values. Classifying an item as missing, retired, or disposed requires a reason; missing/retired classifications require a centre/state/head-office manager, and only Head Office can dispose an asset. A disposed record cannot be reactivated through the normal edit endpoint. Transfer approval must come from someone other than the requester.
- `GET /api/v1/transfer-batches`, `POST /api/v1/transfer-batches`, and `PATCH /api/v1/transfer-batches/:id` support grouped transfer requests, approval, dispatch, and per-item receipt. A manifest is limited to 100 assets at one origin location. Damaged arrivals create a repair report; items marked not received stay at their last recorded location and raise a review alert. Direct asset location/status edits are blocked while a single transfer or manifest is open.
- `GET /api/v1/insights/alerts` returns scoped review signals for assets marked missing, assets unseen after a verification window, duplicate serial numbers, transfers open longer than seven days, and unresolved urgent reports. An overdue scan remains a review signal and is never promoted to a missing or stolen status automatically.
- `GET /api/v1/assets/:id/activity` combines asset edits, verification scans, related reports/transfers, custody, and warranty events. Results are limited to assets in the caller's authorized location scope.
- The Watch queue is currently in-app. Automated push, email, or messaging delivery requires a production scheduler and a notification provider; the seven-day stalled-transfer threshold should be configured by Head Office before the pilot.
- The web scanner uses the device camera for QR/barcode lookup. Browser-side support for compatible BLE/UHF RFID readers and printers still needs a managed Android/native client, selected hardware, and vendor integration; browsers cannot silently pair arbitrary readers or provide raw Bluetooth printer sockets. See `docs/security-and-workflow-review.md` for the recommended pilot boundary.
- An asset can also carry an optional tenant-unique hexadecimal RFID EPC. `GET /api/v1/assets/rfid/:epc` resolves one EPC within the caller's role scope. `POST /api/v1/verification/cycles/:id/rfid-scans` accepts up to 5,000 EPC readings, records authorized matches as idempotent `rfid` scan events, and reports duplicates, unknown tags, and tags found in another location. A floor custodian sees only EPCs and cycle progress inside assigned locations. The web app supports entering one EPC or receiving one from a compatible keyboard-wedge reader; the batch route is the adapter boundary for a future supported handheld. No UHF reader, printer, gate, chip lock, or RFID hardware is connected by these files.
- EPC binding and replacement are retained in `asset_rfid_bindings`. Replacing or removing a bound tag requires a reason; retired EPCs no longer resolve and cannot be silently assigned to another asset. This records the software binding lifecycle, not proof that a physical chip was successfully written or remains attached.
- EPCs are opaque values at this layer; choose and validate an allocation scheme with GS1 and the label supplier before mass encoding. No tag access passwords or factory chip identifiers are stored.
- `GET /api/v1/assets/:id/qr` returns a signed QR value after checking the caller's normal asset scope. `GET /api/v1/assets/qr/:qrPublicId` continues to resolve legacy UUID labels and also verifies signed `INCU1` labels on the server. Signed claims contain only version, key ID, organization ID, and the random QR identity; asset names, serials, centre details, and secrets are not encoded. Offline scanning verifies the Ed25519 signature with the configured public key before resolving the cached asset. Legacy UUID labels remain supported.
- Configure `ASSET_QR_SIGNING_KEY_ID` and `ASSET_QR_SIGNING_PRIVATE_KEY` in the API secret manager, `ASSET_QR_VERIFY_PUBLIC_KEYS_JSON` in the API runtime, and the matching public-key map in `VITE_ASSET_QR_PUBLIC_KEYS_JSON` at web build time. Keep old public keys in both key maps while their printed labels remain in use. If signing is not configured, live label issuance fails closed; it does not silently produce a new unsigned label. Never place a private key in the frontend or repository.
- A valid signature shows that a trusted key issued the code; it does not prevent photocopying, prove that the tag remains attached to the asset, or authenticate a person. RFID writing, hybrid label printing, reader pairing, and exit portals still require a selected hardware/native-device pilot.
- The six optional post-core modules (BOQ/Fast-Bind, client handover, vendor SLAs, consumables, indoor floorplans, and e-waste/ESG) have been assessed but are not implemented. See `docs/post-core-capability-roadmap.md` for the corrected design, rollout order, and policy gates.

## Background asset exports

- `POST /api/v1/exports/assets` queues an assets CSV and returns a job ID. `GET /api/v1/exports` lists the requester's jobs; `GET /api/v1/exports/:id` returns status; `POST /api/v1/exports/:id/cancel` cancels a queued job; `GET /api/v1/exports/:id/download` creates a five-minute private download link after current permission and location checks.
- The `asset:export` permission is granted to Head Office, State Head, and Centre Head roles. Head Office can request an organization-wide file; every other role must select an assigned location. The export rechecks the requester's active permission and scope before publishing, and only the requester can download it.
- Jobs are claimed with PostgreSQL `FOR UPDATE SKIP LOCKED`, a lease token, and up to three attempts. CSV generation uses keyset pages inside a consistent read snapshot, formula-safe cell encoding, and hard limits of 250,000 rows and 100 MiB. Each output records a SHA-256 checksum; progress and request/completion/download events are auditable.
- Run one or more workers from the same release with `npm run worker:exports`. Run this as a separate process with database access and the same private S3-compatible storage configuration as the API. Objects remain private, use KMS in production, and are deleted after seven days. Add a bucket lifecycle rule to remove objects under `*/exports/` after eight days as a backstop for files left by an interrupted worker. The worker never logs asset rows or file contents.
- The queue limits each user to three active jobs and each organization to fifty. Operations must keep the worker process supervised and configure the private object bucket, KMS access, and backup/retention policy before production use.

## Centre directory

- `database/seeds/incuspaze-centre-directory.csv` is the import-ready version of the centre list supplied on 10 October 2026. Review its source notes in `database/seeds/README.md` before importing.
- Head Office can preview the CSV with `POST /api/v1/locations/import/preview` and import it with `POST /api/v1/locations/import`, passing the CSV text in `{ "csv": "..." }`. The import creates state, centre, and direct floor records in one transaction. Duplicate codes, missing states, and invalid parent references stop the import.
- Floors can be direct children of a centre or of a building. A city does not produce a map pin; exact centre coordinates remain unconfirmed until an authorized person verifies them. The centre import accepts an optional `Physical Address` column, but imported addresses stay unverified. A centre head can confirm an address and coordinates for their centre; State Head and Head Office confirmations are marked verified. Address and coordinate changes are written to the audit log. Run `npm run db:migrate:physical-addresses` on an existing database, or `npm run db:migrate` for a fresh setup.

## In-app notifications

- `GET /api/v1/notifications` saves up to 200 current, role-scoped Watch signals per refresh into a private per-user inbox and returns 50 items per cursor page with an unread count. The upsert is idempotent, so refreshing does not create duplicate notices. Scheduled missed-cycle notices and report/transfer/missing events use the durable worker; other Watch signal types remain refresh-captured.
- `PATCH /api/v1/notifications/:id/read` marks one of the caller's notifications read. Both reads and updates are tenant/user scoped and re-check the asset's current location access, so moving an asset or changing a user's role removes stale access to its prior alert history.
- `npm run worker:notifications` consumes missing-asset, report, and transfer events from the durable outbox. Delivery into the in-app inbox is transactional and idempotent, recipients are resolved through their current active scoped permissions, and failures retry with backoff before dead-lettering after eight attempts.
- The worker also sweeps expired verification cycles every five minutes and saves every still-unseen in-scope asset to the inbox, even when nobody opens Watch. Other live Watch signals can still be captured when the signed-in app loads or refreshes. The worker does not send push, email, or WhatsApp notifications while the app is closed; tiered timed escalation and external delivery need an approved policy/provider.
- Run `npm run db:migrate:notification-inbox` on an existing database, or `npm run db:migrate` for a fresh setup.
- Run `npm run db:migrate:notification-outbox-worker` to add retry and dead-letter scheduling fields to an existing notification outbox.
- Run `npm run db:migrate:verification-watch-indexes` to add the scan/cycle indexes used by the scheduled overdue-cycle sweep.

## Production boundary

GitHub stores application source and reviewed migrations only. Asset data, employee data, invoices, camera images, QR secrets, and exports belong in the production database and private object storage. Uploads use short-lived signed URLs and checksum verification. In production, object uploads request SSE-KMS; set `OBJECT_STORAGE_KMS_KEY_ID` to use the organization-managed key, and keep the bucket private with public access blocked. Queued offline writes need stable client-generated IDs and server acknowledgement before being shown as centrally saved.
