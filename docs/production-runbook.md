# Production operations runbook

This runbook describes the operating controls the service already exposes and the checks required before a real-centre pilot. It is provider-neutral because the production hosting, identity provider, and notification vendor have not been selected. Do not treat a passing local build or the synthetic recovery drill as a production deployment.

## Service processes

Deploy three independently supervised processes from the built API package:

| Process | Start command | Purpose |
| --- | --- | --- |
| API | `npm start` | Authenticated versioned API and health probes |
| Notification worker | `npm run worker:notifications` | Recurring verification cycles, overdue scans, and in-app outbox delivery |
| Export worker | `npm run worker:exports` | Private, scoped CSV export jobs and expired export cleanup |

The workers handle `SIGTERM` and `SIGINT` and stop their loops before closing database connections. Keep them supervised with automatic restart and bounded resource limits. The workers claim work through PostgreSQL transactions, row locks, idempotency keys, and leases; do not run a second scheduler that creates competing verification cycles or sends duplicate notifications. External email, push, and WhatsApp delivery is not implemented; the notification worker currently writes in-app inbox records only.

## Health probes and release sequence

- Configure the platform liveness probe to call `GET /api/v1/health/live`. It confirms the process can answer and intentionally stays independent of PostgreSQL.
- Configure the readiness probe to call `GET /api/v1/health/ready`. It returns `503` when PostgreSQL is unavailable. The existing `GET /api/v1/health` is retained as a readiness alias.
- Build with the repository-pinned Node.js version in `.nvmrc`; install each package from its lockfile with `npm ci`, run its tests, run its production build, and verify the API/worker entrypoints with `npm run verify:entrypoints --prefix asset-register-api`.
- Deploy the complete frontend `dist/` output, including the same-origin `/ocr/` worker, engine, and English model, plus the `/vision/` MediaPipe runtime and EfficientNet-Lite0 model. Keep the generated service worker intact: OCR files are precached, while the larger photo-classifier model and WebAssembly engine are cached on first explicit setup so the initial PWA download stays smaller. The frontend CI verifiers check the pinned static files and offline cache route.
- Bind the API and workers to private service interfaces behind the selected platform's ingress. Set `HOST=127.0.0.1` for local-only API testing; the container-friendly default remains `0.0.0.0`.
- Apply database migrations as a separately controlled deployment step. On an existing database, apply only the unapplied migrations in numeric order after testing that same sequence against a staging restore. The convenience `db:migrate` script applies the full migration sequence and is intended for a fresh database, not an unreviewed release hook.
- Deploy the API and both workers from the same immutable commit and migration version. Verify liveness, readiness, authenticated sign-in, scoped reads/writes, private evidence upload/download, an in-app notification, an export, and worker restart before sending pilot users to the release.
- Prefer additive, backward-compatible schema changes. Do not automatically reverse migrations during a rollback; first restore a compatible API version or ship a forward fix.

## Required configuration and secret handling

Use the API and frontend `.env.example` files as the authoritative variable names. Supply values through the chosen platform's secret/configuration manager, never through Git, issue text, build logs, or browser storage.

Before pilot, confirm:

- `DATABASE_URL` points to the managed production PostgreSQL instance with TLS and a least-privilege application role.
- `OIDC_ISSUER_URL`, `OIDC_AUDIENCE`, and `OIDC_JWKS_URL` match the approved identity provider; the frontend's OIDC authority, client ID, redirect URLs, and logout URL match the exact production domains. Require the organization's MFA and employee-offboarding policy for privileged roles.
- `WEB_ORIGIN` lists only the production web origins. Keep `VITE_DEMO_MODE=false`; production builds do not enable the demo store.
- Object storage is private, blocks public access, enforces encryption, and uses the organization-managed KMS key through `OBJECT_STORAGE_KMS_KEY_ID`. Grant only the API and workers the required object permissions. Configure and test the eight-day lifecycle rule for the export prefix so orphaned objects are removed after the seven-day application retention period. Evidence retention remains an organization policy decision.
- The Ed25519 QR signing private key stays in the API secret manager. Publish only the matching public key(s) to the frontend and retain old public keys while labels signed with them remain in service.
- The database connection budget accounts for a pool of up to 12 connections per API process plus worker and migration connections; set replica counts and PostgreSQL limits together.

All `VITE_*` values are included in the browser bundle. They must contain public configuration only; never put database, object-storage, QR-signing, or identity-provider client secrets there.

The API trims and validates `WEB_ORIGIN` values at startup. Production requires at least one exact HTTPS origin; wildcard origins, localhost, credentials, and URL paths are rejected before the HTTP server starts.

Production startup also fails if database TLS is not set to `sslmode=verify-full`, OIDC issuer/audience/JWKS values are incomplete or insecure, or private evidence storage lacks both a bucket and customer-managed KMS key ID. A custom S3-compatible endpoint must use HTTPS. Supply a provider CA file through the PostgreSQL connection URL when the managed database certificate is not signed by a system-trusted CA. These checks prevent the API from serving a partially configured production deployment; they do not replace provider-side least-privilege, bucket privacy, or MFA configuration.

## Synthetic read-load check

`npm run test:load` runs a read-only HTTP load check against the paginated asset register, overview, map, Watch queue, and audit feed. It reports request rate, p50/p95/p99/max latency, status counts, and failures per route. Defaults are 10 concurrent requests, a five-second warmup, and a 30-second measurement; limits are capped at 100 concurrent users and 15 minutes. It never creates, edits, or deletes application records and never prints the bearer token or response bodies. Use only a non-production environment populated with synthetic or approved redacted data.

Set `ASSET_REGISTER_LOAD_API_URL` to the full `/api/v1` URL, `ASSET_REGISTER_LOAD_TOKEN` to a short-lived test bearer token, and `ASSET_REGISTER_LOAD_ORGANIZATION_ID` to the test tenant. The test identity needs `asset:read` and `audit:read` in the chosen scope. Localhost can use HTTP. A remote target must use HTTPS and requires both `ASSET_REGISTER_LOAD_TARGET=staging` and `ASSET_REGISTER_LOAD_STAGING_ACK=I_ACKNOWLEDGE_STAGING_READ_ONLY_LOAD`; production-looking hosts are blocked. Set `ASSET_REGISTER_LOAD_CONCURRENCY`, `ASSET_REGISTER_LOAD_DURATION_SECONDS`, `ASSET_REGISTER_LOAD_WARMUP_SECONDS`, and `ASSET_REGISTER_LOAD_REQUEST_TIMEOUT_MS` to tune a staging run. Inject the token from a secret manager rather than a shell command or committed file. No latency pass threshold is guessed here; Head Office and platform owners must agree SLOs from the intended workload and deployment size.

## Monitoring and alert response

The application currently exposes health probes and structured service logs, but no production metrics endpoint or provider integration. The platform owner must configure monitoring and paging before the pilot. At minimum, alert on:

- readiness failures, sustained API error rate, request latency, process restarts, and database connection exhaustion;
- notification outbox age and retry/dead-letter growth, overdue verification sweeps, and worker restarts;
- queued/running/failed exports, expired object cleanup failures, and private evidence upload/download errors;
- database backup age, object-store/KMS access failures, and storage capacity.

For an access incident, suspend the affected role assignment or identity-provider account, preserve relevant audit and identity-provider logs, and follow the organization's incident process. Do not erase an asset record to resolve a data-quality or suspected-theft report; preserve the investigation trail and use the audited lifecycle workflow.

## Backup, recovery, and retention

- Use the scripts in `asset-register-api/scripts/` only for controlled local or staging drills. Production recovery must use the selected database provider's encrypted backups, retention, and point-in-time recovery controls.
- Before pilot, agree recovery point objective (RPO), recovery time objective (RTO), backup retention, encryption-key recovery, and the approved restore region. A successful synthetic restore is not evidence that those targets are met.
- Run a production-like recovery exercise against an isolated restored copy. Verify migrations, representative synthetic or approved redacted records, object-store references, login, scope checks, workers, and exports. Record restore time, data loss window, and corrective actions.
- Agree retention and legal-hold handling for asset history, verification scans, custody, invoices, photos, notifications, and exports. Verify expiry cleanup in both PostgreSQL and object storage; do not assume an expiring signed URL deletes its underlying object.

## Pilot release gate

Do not open a live pilot until the organization has approved the active-centre directory and state mapping, verified centre addresses/coordinates, configured identity and MFA, provisioned production hosting/secrets/private storage, selected notification delivery expectations, set recovery and retention targets, completed a formal security/accessibility/device review, and named pilot owners and support contacts. Start with selected centres, reconcile a known asset sample, and measure scan completion, mismatch handling, offline sync recovery, and operational response before expanding.
