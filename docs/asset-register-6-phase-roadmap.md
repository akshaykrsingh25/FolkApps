# Incuspaze Asset Register — 6-phase delivery roadmap

Each phase delivers a usable vertical slice. The phase gate is the evidence required before expanding scope; later phases build on the earlier data and security foundations.

## Delivery status

- **Phase 1 — application foundations implemented and verified; organization deployment gate remains open.** OIDC verification and scoped membership, tenant-bound database constraints, response request IDs, independent liveness/readiness probes, Node.js 24.21.0 pinning, CI test/build jobs, database backup/restore scripts, a PostgreSQL 16 synthetic recovery drill, and a provider-neutral production runbook are in place. Both locked dependency trees report zero npm audit vulnerabilities as checked on 10 October 2026. The organization's actual identity-provider values, managed secrets, hosted environments, deployment target, monitoring provider, and recovery objectives still need organization infrastructure.
- **Phase 2 — implemented and verified.** Location hierarchy, role-scoped asset create/search/detail/edit, opaque QR identity, and print label are connected to the versioned API. Optional Ed25519 QR signing now supports trusted issuance and offline verification when key configuration is present. Optional organization-unique EPC linkage, auditable tag bind/rebind history with required retirement reasons, and a scoped, idempotent RFID batch-reconciliation API are in place; selected readers, tag encoding, and label printers remain an uncommissioned hardware pilot. The supplied centre sheet has 64 rows and is normalized into 60 centre records: four centre codes appear twice for separate floors, which are preserved beneath their shared centre. The city-to-state mapping is recorded in demo data; the company still needs to approve the active list and verify physical addresses before production import. Head Office has an audited CSV preview/import API for centres; each row must include an explicit state, and duplicate or incomplete rows block the entire import.
- **Phase 3 — implemented and verified.** Camera QR/barcode lookup with manual fallback, on-device OCR for asset labels and invoices, reviewable category/product and field suggestions, metadata-based duplicate checks, and on-device 64-bit difference-hash comparison with registered asset photos. High-similarity matches can suggest a name/category from the existing record; the user reviews every suggestion. Only the compact signature is sent to the matching endpoint; asset evidence remains in private object storage. The matcher is a visual-similarity hint, not a general-purpose object-recognition model. New asset-photo uploads populate the indexed signatures; any evidence created before this feature needs a re-upload or a future backfill before it can participate. Private signed evidence upload/download, idempotent retries, and encrypted offline drafts with encrypted attachments are also in place.
- **Phase 4 — recurring cycles, scoped escalation, and closure implemented and verified; external delivery remains open.** Head Office can create/edit/disable policies for cadence, scan window, and escalation interval; before/after policy settings are audited. Enabled policies open a first cycle and repeat on the configured calendar-month cadence (defaults: six months and a 60-day window). The worker waits for the prior cycle to close before starting the next, prevents duplicate policy starts, and audits generated cycles. Overdue assets escalate in-app from Custodian → Centre Head → State Head → Head Office at the configurable interval (default seven days per step), with recipient scope checks and idempotent notices. Head Office closes a cycle with a required reason; closure records unresolved count and an audit event. A later scan, explicit missing/retired/disposed status, or cycle closure stops further escalation. Missed items are never automatically changed to stolen or missing. Push/email/WhatsApp delivery still needs an approved provider.
- **Phase 5 — lifecycle workflows, inbox preferences, and scoped audit feed implemented and verified; external delivery remains open.** Condition and repair reports with audit/outbox records, scoped approval → dispatch → receipt transfers that only update location on receipt, warranty/guarantee/AMC records, an unused stock status/filter, and named custodian issue/return records with condition and handover notes. Transfer approval now requires a different authorized person than the requester. Missing-asset, report, and transfer events fan out to scoped in-app recipients with transactional acknowledgement, retry backoff, and dead-letter state. Each user can quiet routine notification categories; high-priority alerts remain visible. Head Office, State Heads, and Centre Heads have a keyset-paginated audit feed filtered to their current assigned locations, with event type and location filters. Push/email/WhatsApp delivery still needs an approved provider and policy.
- **Phase 6 — application implementation delivered; production rollout gate remains open.** The responsive India map and state-to-centre-to-floor/area navigation are implemented. The 64-row centre list supplied for the prototype is represented as 60 centre records, with four repeated centre codes consolidated and their eight floor rows preserved beneath the corresponding centres. Centre pins are shown only after coordinate confirmation. Authorized centre managers can open a centre-specific Google Maps search, save or confirm the physical street address, paste a latitude/longitude pair, or enter coordinates separately; imported addresses remain unverified, address and coordinate changes are audited, and the API enforces India map bounds. Head Office can preview and import a centre CSV with explicit state mapping, optional physical addresses, row validation, duplicate detection, and transactional writes. Scoped overview metrics include asset counts, scan completion, missing assets, repairs, unused stock, open reports, expiring coverage, active verification cycles, and transfers in motion. A scoped Watch queue surfaces marked-missing items, unseen assets after the scan window, duplicate serial numbers, transfers open longer than seven days, and unresolved urgent reports; Watch results are now keyset-paginated so older signals remain reachable, and an unseen asset remains an investigation prompt rather than an automatic loss classification. The in-app inbox is cursor-paged; the continuously running notification worker creates recurring verification cycles, saves overdue verification misses, and fans out missing-asset, report, and transfer events to scoped users. Inbox refresh snapshots at most 200 current signals, while the Watch view can page through all matching signals. Tiered escalation is in-app and policy-configurable; external push/email/WhatsApp delivery still needs an approved provider and a deployed worker service. Asset detail now includes a joined activity trail for record edits, scans, reports, transfers, coverage, and custody. Asset and map-place lists use cursor pagination. Background CSV export jobs now have requester/scope checks, permission revalidation, idempotency, queue limits, retry leases, audit events, formula-safe output, checksums, private downloads, and seven-day cleanup. The eight primary screens were visually and layout-checked at 375px, 768px, and 1440px with no horizontal overflow; frontend/API builds and tests pass, including custody, alert, and export workflow coverage. A synthetic PostgreSQL 16 baseline now exercises Watch, overview, map, and audit queries at 64 centres, 64,000 assets, and 100,000 audit events; the local plans completed in 44–253 ms with a warm cache. Production-shaped volume, concurrent load, and service-level targets remain open; see [query-plan baseline](query-plan-baseline.md).

## Phase 1 — Platform, identity, and governance

**Goal:** establish a safe production base before any real company data is entered.

- Settle the identity provider, organization tenancy, role definitions, data retention, and photo/invoice access policy.
- Build the React + TypeScript installable PWA shell and the NestJS versioned API while preserving the approved Incuspaze UI direction.
- Set up PostgreSQL migrations, development/staging environments, secrets management, audit conventions, request IDs, backups, and deployment pipeline. The API now returns a UUID `x-request-id` for support correlation; CI verifies both packages, and PostgreSQL 16 recovery is exercised against disposable synthetic databases. A hosted deployment and managed backup policy still require an approved environment.
- Implement OIDC sign-in and server-side authorization for Head Office, State Head, Centre Head, custodian, and viewer scopes.
- Add tenant-safe query patterns and seeded, clearly synthetic development data.

**Exit gate:** users can sign in; a request cannot read or change data outside its organization and assigned location scope; database restore and audit trail are demonstrated in a non-production environment.

## Phase 2 — India location network and asset register

**Goal:** make the organization’s physical inventory and ownership structure reliable.

- Load and review states, active centres, warehouses, and centre codes; flag incomplete or conflicting source rows rather than silently guessing. The supplied 64-row directory is bundled as 60 demo centre records because four codes repeat for separate floors. City-to-state mapping is present for the demo, and the import API requires explicit states; company approval of active status, centre identity, and physical addresses is still needed before production import.
- Build the hierarchy India → state → centre/warehouse → building → floor → area, with centre-head management of internal and external spaces.
- Add asset create, edit, search, detail, category, serial number, condition, custodian, and location workflows.
- Store invoice and asset-photo metadata in the database and files in private object storage.
- Generate opaque QR identities only after a record is saved; support printable labels and tag reissue history. Signed labels use a server-held Ed25519 key and public-key verification; legacy opaque labels remain accepted.
- Optionally associate a hexadecimal RFID EPC and reconcile scoped reader batches within a verification cycle. Keep the GS1 identifier scheme and reader hardware behind an approved pilot gate; the current app does not pair or program UHF devices. See [hybrid QR + UHF RFID pilot](hybrid-identification-pilot.md).

**Exit gate:** a centre head can set up a centre and record/search assets; a state/head-office user can see only their authorized roll-up; every listed centre has an explicit location-data confidence state.

## Phase 3 — Field capture, smart suggestions, and offline sync

**Goal:** make on-site asset capture fast and dependable, including weak-connectivity locations.

- Build camera-first capture for asset photos, QR/barcodes, invoices, and product labels.
- Add OCR and image-matching behind review screens: extracted invoice/label values and image-similarity category/name suggestions remain editable and never silently overwrite a saved record. The current implementation uses on-device OCR and a difference-hash look-alike index; it does not claim open-ended AI object recognition.
- Compare new captures with existing assets by tag, serial, manufacturer/model, image similarity, and location; show likely duplicates for human review.
- Store unsynced scan actions in an encrypted local queue with visible pending/synced/failed states.
- Sync with idempotency keys, retry/backoff, conflict handling, and a clear server acknowledgement before showing “saved centrally.”
- Support low-bandwidth image upload, compression, resumable retry, and explicit retention controls.

**Exit gate:** staff can capture and queue an asset offline, reconnect, sync once without duplicate records, review suggestions, and recover from a failed upload without losing the capture.

## Phase 4 — Verification cycles and missing-asset control

**Goal:** turn six-month scans into a clear, accountable control process.

- Let Head Office configure cycle cadence, scan window, grace period, exceptions, and who can open/close a cycle.
- Default to a six-month cycle with a two-month completion/grace window, while preserving policy history when settings change.
- Track progress by organization, state, centre, floor, and area; support QR scan, manual lookup, and location confirmation.
- Identify assets not seen by the cycle deadline; distinguish “not yet scanned,” “under investigation,” and “confirmed missing.”
- Route reminders and escalations from custodian to Centre Head to State Head to Head Office, with delivery and action history.
- Provide offline cycle manifests and conflict-safe scan synchronization.

**Exit gate:** cycle totals reconcile to the asset register; extensions and exclusions are audited; unresolved items escalate on the configured schedule; no asset is automatically classified as stolen solely because it was not scanned.

## Phase 5 — Repair, transfer, warranty, and asset lifecycle

**Goal:** keep issues and movement traceable from report through resolution.

- Implement damage/repair/out-of-service reports with asset link, exact place, urgency, photo evidence, owner, status, and resolution notes.
- Add transfer requests, source/destination approval, dispatch/receipt confirmation, handover evidence, and movement history.
- Record who has physical custody of an item, the item's handover/return condition, and who recorded each step; show the full custody history with the asset.
- Track unused/available assets and propose centre-to-centre transfers without changing ownership/location until approved and received.
- Add warranty/guarantee/AMC dates, seller and service-centre contacts, reminders, and claim/repair notes.
- Define lifecycle rules for active, in repair, out of service, missing, retired, and disposed assets; require reasons and approvals for sensitive changes.
- Deliver notification preferences, retryable delivery, and an organization-wide audit timeline.

**Exit gate:** each report, transfer, warranty action, and status change has a responsible owner and durable history; notification failures are visible and retryable.

## Phase 6 — India-wide insights, scale, and rollout

**Goal:** launch with trustworthy national views and a supportable operating model.

- Finish the India → state → centre → floor/area map experience with centre pins, explicit coordinate confidence, filters, and accessible list alternatives.
- Build operational dashboards for asset counts, scan completion, missing investigations, repairs, transfers, warranties ending, and unused stock.
- Provide a scope-aware Watch queue with explainable signals, including verification misses after grace, duplicate serials, stalled transfers, and urgent open reports. Keep human review between a signal and a confirmed loss.
- Use cursor pagination, indexed filters, aggregate endpoints, background export jobs, and measured query plans for nationwide datasets. Asset, map-place, Watch, audit, notification, and transfer-manifest pages use cursor pagination; scoped aggregate endpoints and background export jobs are implemented. A warm-cache synthetic PostgreSQL baseline is recorded in [query-plan baseline](query-plan-baseline.md); representative approved data, concurrent-load testing, and production latency targets remain open.
- Import the approved centre directory and support audited CSV onboarding/export with validation, duplicate detection, and a review report; do not infer uncertain addresses or coordinates from centre names. CSV preview/import accepts optional physical addresses, and scoped background asset export is implemented; importing the approved directory, resolving its duplicates, and confirming exact addresses and coordinates remain open.
- Complete security review, accessibility review, device/browser checks, backup/restore exercise, monitoring, alerting, and incident runbooks. Core screens have been checked at 375px, 768px, and 1440px; a synthetic PostgreSQL 16 backup/restore drill and production runbook are complete. Formal security/accessibility reviews, a broader device matrix, and hosted monitoring/alerting still need organization sign-off and infrastructure.
- The Watch queue is an in-app queue that refreshes when opened. Proactive push/email/WhatsApp delivery and timed escalation need a production scheduler and an organization-approved notification provider. The stalled-transfer signal currently uses a seven-day starting threshold; Head Office should tune it before the pilot.
- Pilot with selected centres and custodians; reconcile sample asset data, measure scan time and sync failures, then expand by state in controlled waves.
- Train centre/state/head-office roles and publish support, escalation, and data-correction procedures.

**Exit gate:** the pilot meets agreed data-quality, sync, authorization, and support targets; recovery is exercised; rollout owners and expansion criteria are approved. This gate requires the organization’s identity provider, production hosting, approved asset/directory data, recovery environment, and pilot owners, so it is not represented as complete by local demo results.

## Delivery rules across all phases

- Treat GitHub as the source-code and migration repository. Live asset records, employee details, bills, photos, QR secrets, and exports stay in authenticated production services.
- Enforce authorization in the API on every request. Hiding a control in the interface is not access control.
- Make writes auditable and retry-safe. Keep human review for recognition, OCR, duplicate suggestions, missing classification, and transfer approval.
- Release one useful end-to-end workflow per phase; do not defer all working software until a final phase.
- Keep operational decisions configurable and versioned instead of hard-coding cycle dates, escalation rules, or role scope.
