# Post-core capability roadmap

Reviewed 10 October 2026 against the current NestJS API, React client, PostgreSQL schema, location hierarchy, report/transfer flows, private evidence service, and the supplied client handover proposal.

These are optional product modules. None of the six is represented as already built. The current app's tenant-scoped assets, verification, condition reports, transfers, evidence metadata, activity history, and notification outbox are the foundation they should extend.

## Recommended order

| Order | Capability | Why this order | First useful release |
|---|---|---|---|
| 1 | Fit-out BOQ ingestion and Fast-Bind | Largest immediate reduction in bulk setup effort; can use existing asset and QR flows | Validated import preview, duplicate report, pending-affix queue, and atomic QR bind |
| 2 | Client move-in / move-out handover | Extends asset evidence and history, but needs client/lease data and approved sign-off and charge rules | Baseline manifest, condition photos, review, immutable signed snapshot; no automatic deposit deduction |
| 3 | Vendor SLA / AMC ticket hub | Builds on existing repair reports and outbox, then adds vendor contracts and measured response times | Vendor assignment, acknowledgement/resolve timestamps, configurable SLA queue and escalation events |
| 4 | Spare parts and consumables | Closes a common repair stock gap; should be quantity-ledger data rather than fake individual assets | Receive, issue-to-repair, adjust, and low-stock alerts with a transaction history |
| 5 | SVG indoor floorplans and audit heatmap | Depends on reliable floor/area hierarchy and verified floorplan ownership/versioning | Approved SVG per floor, safe area links, and cycle progress states with an accessible list alternative |
| 6 | E-waste passport and ESG reuse metrics | Disposal evidence is a useful control; carbon metrics require defensible factors and verified events | Require recycler/certificate evidence on e-waste disposal; publish reuse totals first, carbon estimates only after methodology approval |

The order can change if the organization has an active fit-out, tenant exit, vendor-SLA, or e-waste compliance deadline. A single high-priority control can be pulled forward without enabling the entire module.

## 1. Fit-out BOQ ingestion

**Keep:** bulk import, duplicate checks, pre-created records, then scan a physical label and bind it to one planned item.

**Correct implementation:** import into a tenant-scoped staging batch, not directly into `assets`. Validate file type/size, required columns, location scope, serial/tag uniqueness, category mapping, and row count. Show an import preview and downloadable row errors. Give each source row a stable idempotency key. Create explicit `pending_affix` items in a fit-out batch; they are not operational assets and do not appear as present/verified. A transaction binds one staged item to one generated asset tag/QR and records actor, time, and the source row. Re-importing the same batch must not create duplicates.

**Needs before rollout:** an approved BOQ template and rules for who can import, approve, cancel, and correct a batch. Preserve the original source file as restricted evidence if procurement requires it.

## 2. Digital client handover and handback

**Decision:** the business flow is valuable, but the supplied schema and code are not safe to implement as written. Implement it as an optional, tenant-scoped module after contract, sign-off, and settlement policies are agreed.

### Corrections to the supplied proposal

- Do not create a second asset register or use unscoped `client_id`/`centre_id` fields. Use the current `organization_id`, `assets`, `locations`, `evidence`, `audit_events`, and role-scope checks. Add a client and lease model only when the organization has approved its fields and access rules. A UUID array of area IDs is not a referentially constrained allocation; use a join table with tenant-safe foreign keys.
- Separate legal ownership from client allocation. A move-in must not automatically set `ownership_type = CLIENT_DEDICATED`: a company-owned chair assigned to a tenant suite is still company-owned. Store the lease/space allocation and baseline protocol separately. Do not add a `client_id` to assets until there is a client master with tenant-safe references and privacy rules.
- Store a sealed snapshot for each line: asset identity and relevant displayed fields, recorded condition, location, inspection time, and links to private evidence records. Do not rely on a future join to mutable asset fields to reproduce a signed document. Keep evidence in the existing private evidence service, not URL arrays.
- Reconciliation must distinguish `not inspected / not yet located` from `confirmed missing`. An absent scan is not by itself proof of loss. Compare the complete move-out inspection to the signed baseline, account for authorized replacements/transfers and earlier damage, and let a reviewer classify discrepancies with notes and evidence.
- Remove sample fixed charges such as INR 5,000 per missing item and INR 1,500 per damaged item. The system can present a proposed adjustment only from an approved contract rule, verified value/repair evidence, and finance review. It must never calculate a final security-deposit deduction from a hard-coded default.
- Do not call an OTP-stamped PDF a cryptographic or legally binding digital signature. OTP proves control of a delivery channel at a time; it is not a PDF signing certificate. Use an approved e-sign provider if a legally recognized electronic signature is required. Otherwise retain an explicit acceptance record with signer identity, verified channel, exact document hash, timestamp, consent text/version, and audit event, subject to legal review.
- The sample OTP hash is a plain SHA-256 digest of a low-entropy six-digit code. Use a short-lived, single-use challenge, keyed digest with a server-held secret, attempt limits, resend throttling, delivery audit, and transactional consumption. Never accept client-supplied IP as authoritative; use trusted proxy configuration and minimize retained network/device metadata.
- The sample signature route regenerates an empty PDF instead of loading the exact reviewed PDF, does not persist the signed bytes or signed URL, trusts `client_ip` from the request body, and returns while a database transaction is still open on an invalid-state branch. It also casts a client name to UUID. None of these paths should be reused.
- The sample reconciliation has no organization scope, performs per-item queries, omits move-out-only additions, and converts every unlisted baseline item straight to missing. Use tenant-scoped set-based queries and a review state. Recompute idempotently from a frozen baseline and record who approved the final settlement.
- Do not change asset ownership or status just because a client accepted a PDF. Move-out must create explicit operational review actions. Confirmed missing remains a missing investigation; damaged or not-working assets follow the existing report lifecycle. Preserve existing status values and authorization rules.
- Generate a complete paginated PDF from a stored snapshot, never truncate at the first page limit. Persist private document evidence and its SHA-256 digest. The digest proves whether these bytes later changed; it does not prove the truth of the inspection or provide a qualified signature.

### Review of the supplied multi-page PDF generator

Its page-break and evidence-annexure direction is useful, but this code is still a prototype and should not be wired into production as-is:

- `fetchAndEmbedImage` fetches caller-controlled URLs, creating an SSRF path into internal services and metadata endpoints. Accept only evidence IDs already authorized for the handover, load bytes through the private object-storage adapter, and enforce byte, dimension, count, timeout, and total-document limits. Do not accept arbitrary URLs or base64 data from a request.
- It treats every non-PNG byte sequence as JPEG and does not validate actual media type or safely handle malformed/oversized images. Decode only approved image types; set thumbnail bounds and preserve aspect ratio instead of stretching every photo into the same rectangle.
- It silently includes at most two photos per item. The annexure should include all allowed evidence or explicitly report that more evidence exists, with a configured cap and a complete evidence index.
- The three-line notes logic slices by character count rather than measuring glyph widths or wrapping words, so text may clip, split in the middle of a word, or omit the rest. The main table also truncates model and serial values. Use measured wrapping and either continuation rows or a dedicated detail section.
- Standard Helvetica does not reliably encode the rupee symbol used in `₹`; long/untrusted values can also overflow fixed columns. Embed an approved Unicode font, sanitize control characters, measure text, and add a deterministic fallback for unsupported glyphs.
- `new Date()` and server-local `toLocaleDateString()` make the document's inspection date depend on generation time and runtime locale. Use the sealed inspection timestamp and explicit `en-IN` formatting/time zone from the snapshot.
- Footer page counts are not finalized after annexure pages are added, and the execution page is always appended even when there are no signature details. Do a final page-number pass and label the document as a review copy until sign-off completes.
- The execution-page text asserts that deductions are agreed to and adjusted from the deposit. This must come from approved contract wording and finance review; never bake it into a generic template.
- `applyDigitalSignature()` only draws a visual stamp and recalculates a hash. It does not verify an OTP, sign the PDF with a digital certificate, or prove who accepted it. The displayed IP/email are not a cryptographic signature. Persist the exact reviewed bytes/hash and acceptance evidence; use an approved e-sign provider if a legally recognized electronic signature is required.

Therefore, reuse the pagination concept after replacing the data source and hard-coded legal/financial text. The current repo has no `pdf-lib` dependency or handover data model; this generator is not yet connected to an app workflow.

### Corrected lifecycle

1. An authorized operations user selects an approved lease and creates a `MOVE_IN` or `MOVE_OUT` inspection.
2. Staff scan tags and record condition, exceptions, notes, and private photos. Offline captures remain visibly pending until synced.
3. The server reconciles the move-out inspection against the exact signed move-in snapshot. Unscanned lines become `review_required`, not automatically missing or chargeable.
4. A reviewer resolves each discrepancy; any proposed costs reference the contract clause and supporting repair/replacement evidence. Finance approves the settlement separately.
5. The server seals a versioned manifest and PDF. The client reviews that exact version and accepts or disputes it through an approved channel. Any edit creates a new version and invalidates pending acceptance.
6. The completed protocol is read-only. Corrections are appended as a new, linked amendment. An audit event captures each transition, and signed documents stay in private object storage.

**Required policy choices:** client/lease data owner and privacy roles; who can initiate and witness an inspection; acceptance method/provider; OTP delivery and retention if used; evidence retention; approved condition taxonomy; contract/repair pricing source; dispute window; finance approvers; and amendment/void rules. Until these are settled, keep the capability off and do not claim automated deposit adjustment.

## 3. Vendor SLA and AMC ticketing

Reuse condition reports as the issue record, then add tenant-scoped vendor/contract records, covered categories/assets, business calendar/time zone, priority, acknowledgement and resolution events, and escalation policy versions. The four-hour and 24-hour examples should be configurable contractual targets, not constants. Pause or continue timers according to the contract's support hours and approved exclusions. Escalations enter the notification outbox and retain delivery/action history.

A QR label can identify covered equipment or open a vendor visit flow; it does not authenticate a technician. Record vendor identity through an approved account, invitation, or reception-issued visit code, with explicit check-in/out actions. Show penalty credits as an estimate tied to a contract clause; only Finance can approve a credit or invoice adjustment. Do not infer penalties from a late timestamp alone.

## 4. Spare parts and consumables

Create a separate SKU and stock-movement ledger, scoped by organization and storage location. Record receipts, issues, returns, adjustments, count corrections, actor, and reason; derive quantity on hand from movements or maintain it transactionally with a reconciliation check. Issuing a part can link to an existing repair report and parent asset. Use configurable reorder points and supplier references. Do not create serial-tracked asset records for dongles, cables, wheels, or similar bulk consumables.

## 5. Indoor SVG floorplans

Attach a reviewed, versioned plan to a building/floor, then map approved SVG areas to existing `locations` IDs. Sanitize uploaded SVG (scripts, external references, event handlers, and unsafe embedded content) before rendering. Restrict drawings to authorized centre roles; plans may expose sensitive layouts. Heatmap state should derive from a named verification cycle: unchecked, in progress, verified, or needs review. A missing scan is not a confirmed loss. Keep a searchable area/list view and keyboard-accessible progress summaries for users who cannot interpret the map.

## 6. E-waste passport and ESG

Start with a disposal workflow that requires an authorized recycler and private certificate/manifest evidence before an electronic asset can enter the existing `disposed` state. Add approver, disposal date, weight/category where available, chain-of-custody references, and immutable audit events. The current disposal permissions and vocabulary remain authoritative; add a dedicated disposal record rather than introducing an incompatible `DISPOSED_EWASTE` enum from the proposal.

Reuse reporting can count verified refurbishment and redeployment events first. Carbon-avoided figures require an approved method, asset category/material factors, weights or documented assumptions, factor source/version, and a clear estimate label. Never present illustrative tons of landfill avoided as measured fact without evidence. Keep certificates and exports access-controlled and preserve the source documents.

## Shared implementation gates

- Every new table and endpoint must be tenant-scoped, use composite organization-safe references, and enforce location/role access in the API.
- Every write must be retry-safe and auditable. Reports and alerts should reuse the existing audit and notification outbox instead of introducing a second source of truth.
- Large imports, PDF generation, reconciliation, and bulk exports should be bounded, paginated/background jobs with progress and retry state.
- Feature flags may control rollout per organization, but a flag does not replace server authorization or data migration safety.
- Keep source code and migrations in GitHub; keep lease contacts, contracts, BOQs, inspection photos, signatures, certificates, and live inventory in authenticated production services.

## Current application status

The current app already provides scoped assets and locations, QR identities, private evidence uploads, repair reports, warranties/AMCs, transfers, audit history, verification cycles, and an in-app outbox/Watch foundation. It does **not** yet provide client leases or handovers, vendor ticketing/SLA calculations, consumables stock, floorplan rendering, BOQ imports, e-waste certificates, or ESG metrics. This roadmap is a reviewed proposal, not an implementation claim.

## 11 October 2026 implementation update

The Operations desk now includes a first service-ticket workflow and a safe editable room schematic. Service targets currently use elapsed 24/7 hours only; floorplans are area-linked rectangles, not imported CAD/SVG. The earlier “not implemented” statements for those two limited workflows are superseded by this update. Contract calendars, vendor portals, CAD conversion, and the other optional modules in this document remain outside this release. Refer to `production-runbook.md` for the exact supported boundaries and commissioning requirements.
