# API v1 contract (implementation sequence)

Every request is authenticated with the configured OIDC issuer. The server derives `organization_id`, user identity, role assignments, and allowed location scope from the verified principal. A client supplied organization or centre ID is only a filter; it never grants access.

List endpoints use cursor pagination (`limit` capped at 100, opaque `nextCursor`) and accept filters that the caller is authorized to see.

## First domain routes

| Method and route | Purpose | Required scope |
|---|---|---|
| `GET /api/v1/locations?parentId=` | Browse state → centre/warehouse → building → floor → area | Read locations inside assigned scope |
| `POST /api/v1/locations` | Add a centre or internal location | Head Office for centre; Centre Head for descendants of own centre |
| `GET /api/v1/assets?locationId=&status=&q=` | Search and list registered assets | Read assets inside assigned scope |
| `GET /api/v1/assets/visual-matches?visualHash=&locationId=` | Find likely visual look-alikes using on-device photo signatures | Asset read permission; candidates stay inside current tenant and location scope |
| `POST /api/v1/assets` | Create asset and allocate opaque QR identity | Asset create permission in target location |
| `GET /api/v1/assets/:id` | Asset, coverage, evidence metadata and latest verification | Read asset inside assigned scope |
| `POST /api/v1/scans` | Record a verification scan | Centre scan permission; `Idempotency-Key` required |
| `POST /api/v1/reports` | Submit damage/repair/out-of-service issue | Report permission in asset scope |
| `POST /api/v1/transfers` | Request asset movement with source/destination | Transfer request permission; approvals are separate actions |
| `POST /api/v1/media/upload-intents` | Request a short-lived private upload URL | Evidence permission for related asset/report |
| `GET /api/v1/audit/events?locationId=&eventType=&limit=&cursor=` | Review recent asset, scan, report, custody, and transfer events | `audit:read`; results are constrained to current assigned locations |
| `GET /api/v1/notifications/preferences` | Read the signed-in user's inbox category settings | Signed-in organization member |
| `PATCH /api/v1/notifications/preferences` | Enable or quiet one in-app notification category | Signed-in organization member; high-priority alerts always remain on |
| `GET /api/v1/insights/alerts?limit=&cursor=` | Review prioritized Watch signals without a fixed result cap | Asset read permission; each page is constrained to current assigned locations |

## Verification cycles

| Method and route | Purpose | Required scope / behavior |
|---|---|---|
| `GET /api/v1/verification/policies` | List policies visible to the caller | Assigned location scope |
| `POST /api/v1/verification/policies` | Create a recurring policy | Head Office; cadence, scan window, and escalation interval are bounded and audited |
| `PATCH /api/v1/verification/policies/:id` | Change cadence, scan window, escalation interval, or automatic scheduling | Head Office; before/after values are audited |
| `GET /api/v1/verification/cycles` | List cycles and scoped completion totals | Assigned location scope |
| `POST /api/v1/verification/cycles` | Open or retrieve the active cycle for a policy | Authorized Head Office, State Head, or Centre Head; future start dates remain scheduled |
| `GET /api/v1/verification/cycles/:id/progress` | View the cycle asset manifest | Assigned location scope |
| `POST /api/v1/verification/cycles/:id/scans` | Record a QR, barcode, or manual scan | Authorized location; idempotent event ID; scheduled and closed cycles reject writes |
| `POST /api/v1/verification/cycles/:id/rfid-scans` | Reconcile up to 5,000 EPC readings from a reader export | Authorized location; records only registered matches assigned to the scanned place; never moves an asset |
| `POST /api/v1/verification/cycles/:id/close` | Close the cycle with a required reason and unresolved count | Head Office only; cycle-row locking serializes closure with concurrent scan writes |

Enabled policies open the first cycle immediately and create later cycles on the configured cadence only after the previous cycle is closed. The worker transitions scheduled cycles to open/grace and creates tiered in-app escalation notices after the scan window. Missing scan evidence remains an investigation signal; it does not change asset status automatically. Push, email, and WhatsApp delivery require an approved provider.

Scan and transfer writes append audit records in the same database transaction as the business change. Scan retries with the same idempotency key return the original result. Media bytes go directly to private object storage; API records retain metadata and object keys only. Asset-photo visual signatures are calculated in the browser and compared with previously registered signatures; the matching request does not send the image itself.

## Error shape

Errors return `{ "statusCode": number, "code": string, "message": string, "requestId": string }`. Do not return database details, object keys, or cross-scope record existence to unauthorized callers.
