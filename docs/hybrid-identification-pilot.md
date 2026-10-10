# Hybrid QR + UHF RFID pilot

## Current state

The Asset Register has the software foundation for two identifiers:

- Every asset has a stable, opaque QR identity. Live signed labels use an Ed25519 signature issued by the API; the private key stays server-side and the client can verify with public keys.
- An asset may also have an optional organization-unique hexadecimal EPC. A verification cycle can accept up to 5,000 reader readings per request. The API checks tenant, cycle, and location scope, normalizes EPC case, deduplicates reads within a batch, and writes idempotent scan events. These limits describe the API contract, not a measured reader speed.
- The browser can scan QR/barcodes and record one EPC from manual input or a keyboard-wedge reader. It does not pair a UHF sled, write a tag, print a hybrid label, capture RSSI, or operate a gate.

This is a software foundation and a corrected pilot design. A physical pilot still needs approved devices, a managed native adapter, and site validation; no RFID hardware is connected or assumed by the web app.

## Recommended operating model

### Purchase intake and tag binding

1. Capture the invoice and product photos. Staff review OCR suggestions and save the asset record; suggestions never overwrite approved fields by themselves.
2. Issue the asset's signed QR identity after saving the record. Print the QR using a selected, supported printer and label stock.
3. If the centre is in the RFID pilot, a managed Android app and vendor SDK write the EPC to the selected UHF inlay. Read the tag back and scan the QR before completing the binding. If either check fails, leave the asset clearly marked for tag review; do not silently claim that both identifiers were programmed.
4. Keep the asset's internal asset tag and signed QR identity as the human-readable lookup path. Treat EPC as an optional machine-read key, not as a location, owner, or permission claim.

The API now keeps an organization-scoped RFID binding history. Replacing or removing an assigned EPC requires a reason; the old value stops resolving and remains reserved so it cannot be silently rebound to another asset. A future tag-writer adapter should report a successful write and read-back before staff save the EPC association. A failed or interrupted write must leave the existing binding intact. The current browser form can record an EPC manually but cannot verify a physical write. QR signing, EPC binding, and physical printing/writing remain separate steps until a selected printer and reader adapter can demonstrate one recoverable workflow.

The current browser cannot perform steps 2–3 as a single automated thermal print/encode pass. That needs a selected printer, reader/writer SDK, managed device, and a tested native adapter. A half-completed print or write must be recoverable without issuing a second asset identity.

### Scheduled floor verification

1. The authorized user opens an existing verification cycle and selects the floor or area they are physically checking.
2. The managed reader adapter collects tag EPCs into a bounded local queue. It can keep vendor-specific signal readings locally for the live “find this item” view; submit only fields approved for the server contract.
3. The API reconciles readings with registered assets in the cycle and the user's scope. It records authorized matches and reports duplicate reads, unregistered tags, and assets assigned elsewhere. An RFID read never changes an asset's location or ownership.
4. Staff use signed QR/manual lookup for exception checks, repairs, ambiguous tags, and a specific missing item. An item not read by RFID remains “not scanned” or “needs review” according to the existing cycle policy; it is not automatically marked missing or stolen.
5. A saved offline reading must show “pending sync” until the server confirms it. Retries reuse the same event ID so a reconnect does not create duplicate scan events.

### Transfers and perimeter portals

Do not enable an automatic gate alarm from EPC detection alone. A portal can read nearby tags that are not passing through the doorway, and it cannot prove direction or intent by itself. A later site pilot should first emit a reviewable movement event, correlate it with an approved transfer manifest, test false positives and missed reads, and define a staffed exception path. Only after that should the organization decide whether a security-console alert or relay action is appropriate. A portal must never change asset state or mark an item stolen on its own.

## Identifier and hardware choices

- Select the identifier scheme with GS1 and the tag supplier before bulk encoding. GS1 identifies GIAI for an individual asset; SGTIN is for a serialized trade item. SGTIN-96 has a header, filter, partition, company prefix, item reference, and serial number. The 38-bit portion is a serial number, not a checksum, and the partition controls field widths. Do not encode a custom centre ID into SGTIN fields or use the proposal's `E2` sample as an SGTIN-96 example.
- The API intentionally stores EPC as an opaque hex string until the scheme and issuer are selected. It does not parse a scheme, store factory TID values, or store tag access passwords. Do not expose a shared signing secret in the mobile app; the QR uses asymmetric signing.
- Choose on-metal and non-metal inlays against the actual asset surfaces. Adhesive durability, antenna tuning, orientation, nearby metal/liquid, furniture, walls, and reader position affect performance. “Reads through drywall” and quoted range/read-rate figures are not reliable acceptance criteria.
- For India, confirm the exact reader model, regional firmware, frequency, power, and type-approval path against the current DoT/WPC short-range-device rules and supplier documentation. Do not treat the proposal's 865–867 MHz range as a complete equipment specification.
- Keep QR and RFID tag lifecycle separate from asset lifecycle. A damaged or replaced tag needs an auditable rebind/reissue trail and the old EPC must stop resolving to the asset. Do not treat tamper-evident label stock as proof that a tag has not been copied or moved.
- The QR payload uses the API's asymmetric Ed25519 signature format; do not replace it with the proposal's shared HMAC secret in a mobile client. The signature proves trusted issuance, not that a photographed code is still attached to its original asset.
- Treat any signal-strength/proximity view as an approximate local aid. It is not a surveyed indoor location, and the app should not persist a precise position from RSSI alone.
- The proposed label sample, centre-specific EPC bit layout, 500–700 tag-per-second rates, 3–10 metre ranges, and automatic gate relay are not approved product specifications. Select and test the actual EPC scheme, inlay, printer/writer, and India-configured reader against representative centre environments first.

## Pilot exit checks

Use one representative centre and record results by asset surface and room type. Before expansion, the centre owner and security/IT must set measurable acceptance thresholds for:

- correct reads, missed reads, duplicate reads, and cross-floor/cross-room reads;
- QR-to-EPC binding and recovery after a printer or writer fails partway through;
- offline queue persistence, retry/idempotency, and server reconciliation;
- approved-user scope, unknown tags, wrong-location reads, and access denied cases;
- battery life, handling comfort, audit time, label durability, and total installed cost;
- reader model approvals and supported vendor SDK/version lifecycle.

The app's 5,000-reading request bound is only a safety limit. Benchmark the full selected device-to-server path before setting an operational “assets per minute” target. Keep the phone camera and existing QR process available when the reader is unavailable.

## Standards and regulatory references

- [GS1 EPC Tag Data Standard, current release](https://ref.gs1.org/standards/tds/)
- [GS1 General Specifications](https://ref.gs1.org/standards/genspecs/)
- [GS1 definition of GIAI](https://ref.gs1.org/glossary/giai)
- [India Department of Telecommunications short-range-device rules, 2021](https://www.dot.gov.in/static/uploads/2025/07/84f33f09e137fa81930f44bcd5f2d238.pdf)
