# Asset Register security and workflow review

Reviewed 10 October 2026 against the supplied SQL, Express controllers, watchdog, continuous-scan sample, hardware plan, and security recommendations.

## Added to the application

- Assets carry an ownership class: Incuspaze-owned, client-dedicated, vendor-leased, or trial/demo. The API validates it, returns it in asset records, records changes in the activity log, and the asset form exposes it. A later ownership reclassification is limited to Head Office or State Head scope.
- Transfer manifests group up to 100 assets from one current location to one destination. The database keeps tenant-safe references, prevents an asset from being in two open manifests, and the API rechecks and locks assets before creating the manifest.
- Transfers now have a usable screen for creating grouped manifests and recording every item as received, damaged, or not received. Items remain at their last verified location until destination receipt is recorded.
- A different authorized person must approve a manifest. Dispatch starts a seven-day review timer, matching the existing single-transfer Watch policy. The timer is a derived alert; it does not mutate the lifecycle status.
- Receiving records every item as accepted, damaged, or not received. Only accepted or damaged items move to the destination. A damaged arrival updates condition and creates a high-priority repair report. An unreceived item stays at its last recorded location and appears as a review signal until a later authorized scan accounts for it or a manager records it missing.
- Manifest requests, approvals, dispatches, receipts, and discrepancies are recorded in the existing audit trail. Notification events use the existing outbox.
- Production evidence uploads request SSE-KMS, use ten-minute signed upload URLs, verify the uploaded checksum and metadata, and use five-minute download URLs. Set `OBJECT_STORAGE_KMS_KEY_ID` for the organization's managed key. The bucket must also block public access and have an appropriate bucket/key policy.

## Existing controls reused

- OIDC authentication, organization membership, role-scoped location checks, and tenant-scoped foreign keys remain the access foundation.
- The existing hierarchy (`state → centre/warehouse → building → floor → area`), `location_id`, asset statuses, single-transfer flow, verification cycles, scan-event idempotency, audit events, private evidence workflow, and Watch queue remain authoritative.
- Scans and location scope are validated by the API. A browser-provided device ID, GPS coordinate, or client-computed signature is not treated as proof of identity or physical presence.

## Reviewed and not copied as written

- The proposed standalone `assets`, `batch_transfers`, and `asset_audit_ledger` tables use a different location and status model. Copying them would duplicate the app's asset and transfer records and weaken tenant isolation. `client_id` and `vendor_id` are also deferred until those master records and access rules exist.
- The supplied controller targets Express and trusts `actor_id` in the request body. This application is NestJS; the actor must come from its verified OIDC context. The corrected implementation uses the existing authorization service, organization-scoped composite keys, DTO validation, and `DatabaseService` transactions. Asset location and status edits are blocked while a single-item transfer or manifest is open, so staff cannot bypass the movement record by editing the asset directly.
- The supplied `IN_TRANSIT` asset status and `active_batch_transfer_id` are redundant with the manifest line and can become inconsistent. The application reserves an asset through the open receipt line and checks this condition during every transfer/edit operation. Its existing asset status vocabulary remains unchanged.
- The supplied watchdog changes a transfer to `FLAGGED_OVERDUE` and uses 48 hours. The app already defines a seven-day review signal, so this change uses the established window and reads the database directly. A scheduled worker is only needed when notifications must leave the app.
- The proposed hash-chain query detects a broken `previous_hash` link; it does not recompute each row's hash from canonical event contents, verify the first/genesis entry, or prevent a privileged database operator from rewriting and rehashing rows. The app keeps its attributable audit events; a tamper-evident ledger should be a separate design with canonical serialization, enforced append-only database permissions, chain verification, and an independently protected copy.
- A printed HMAC QR can still be photocopied. The current QR uses an opaque random identifier and requires an authenticated, scoped lookup. Rotating signatures do not establish that the physical asset is present.
- The supplied geofence has a zero-coordinate falsy check, ignores GPS accuracy, and can reject valid indoor scans. Centre coordinates can also be unverified. Do not hard-block a scan on browser GPS or BSSID; if introduced, show a confidence warning and let a trusted centre/location review resolve it. In the sample scanner, duplicate-in-cart detection runs after debounce, so an immediate duplicate can be silently ignored instead of reported. Haptics are optional feedback and need a visible success state as fallback.
- The hardware manager is not directly implementable in the current web client as written. Browsers cannot silently pair arbitrary BLE readers or open raw Bluetooth serial sockets; printer and MQTT support require a selected reader/printer, a managed Android/RN client or gateway, approved device permissions, and vendor SDKs. The existing phone camera remains the default QR/barcode option. A later **optional RFID mode** can be piloted behind a device capability check after procurement chooses a reader. It should report uncertain reads for confirmation and never silently change asset ownership or location. Fixed exit gates should be a separate integration after a site/security pilot.
- The proposed six-month watchdog query bypasses configured verification policies and their grace periods. The app already calculates due/overdue verification from scoped policies, cycles, and scan events; reuse those records. A cron/BullMQ worker is an optional delivery mechanism for outbox notifications, not a second source of scan truth.
- Revoking `UPDATE` and `DELETE` from an application role is useful defense in depth for an audit table, but it does not make a table cryptographically immutable: owners, superusers, backups, or compromised migration credentials can still rewrite it. Do not add an unverified hash chain to the operational workflow. If tamper evidence becomes a requirement, first define canonical event serialization, concurrent append locking, key management, verification/repair operations, retention, privileged-role separation, and an independently protected export or WORM store.
- `scripts/verifyLedgerChain.sql` would only check that each event points to the prior stored hash. It neither recomputes `record_hash` nor validates genesis or protects against privileged rewriting. It also needs an explicit genesis policy before the first row can be evaluated. It is therefore a diagnostic query, not proof that the ledger is authentic.
- IMEI collection is unavailable to ordinary browser code and is excessive for this workflow. If device assurance is required, use enterprise MDM or an approved managed mobile client. Enforce MFA through the organization's identity provider for privileged roles.
- Invoice redaction should not overwrite the original purchase evidence. Keep originals private and provide a separately generated, access-controlled redacted view only after records and procurement teams define which fields need masking.
- India-region hosting is a sensible procurement and operations choice, but should not be hard-coded as a blanket legal requirement based only on the attached note. Review the current Act, Rules, notifications, client contracts, backups, logs, and support access with counsel before production rollout.
- Two-person write-off approval, client-detail privacy walls, scan anomaly limits, retention/erasure workflows, and stronger RLS remain worthwhile production controls. Their thresholds and role rules need organization policy first; the supplied RLS example refers to `centre_id`, which this app does not have, and must be designed for tenant plus hierarchical location scope.

## Remaining production decisions

1. Confirm the identity provider, MFA policy, elevated-role assurance, and employee offboarding process.
2. Confirm write-off value thresholds, who supplies the second approval, and whether client-dedicated asset details should be masked by role.
3. Confirm data-retention periods for custody, scan, and invoice records; legal-hold and correction/erasure handling; KMS key ownership/rotation; and all backup/log regions.
4. Choose the outbound notification provider and delivery schedule. The app currently creates in-app alerts and durable outbox events; it does not send WhatsApp, email, or push messages.
5. Decide whether the optional hardware pilot is worth running. Start with one Android-managed centre and one supported handheld UHF reader; verify scan accuracy, battery, offline behavior, ergonomics, and total cost before adding a second scanning mode. Printer support can be tested separately with one supported label printer. No hardware capability is assumed by the current web build.

## References

- [Digital Personal Data Protection Act, 2023 — MeitY](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023-1.pdf)
- [Digital Personal Data Protection Rules, 2025 — Gazette of India](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
