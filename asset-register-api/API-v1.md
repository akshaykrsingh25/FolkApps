# API v1 contract (implementation sequence)

Every request is authenticated with the configured OIDC issuer. The server derives `organization_id`, user identity, role assignments, and allowed location scope from the verified principal. A client supplied organization or centre ID is only a filter; it never grants access.

List endpoints use cursor pagination (`limit` capped at 100, opaque `nextCursor`) and accept filters that the caller is authorized to see.

## First domain routes

| Method and route | Purpose | Required scope |
|---|---|---|
| `GET /api/v1/locations?parentId=` | Browse state → centre/warehouse → building → floor → area | Read locations inside assigned scope |
| `POST /api/v1/locations` | Add a centre or internal location | Head Office for centre; Centre Head for descendants of own centre |
| `GET /api/v1/assets?locationId=&status=&q=` | Search and list registered assets | Read assets inside assigned scope |
| `POST /api/v1/assets` | Create asset and allocate opaque QR identity | Asset create permission in target location |
| `GET /api/v1/assets/:id` | Asset, coverage, evidence metadata and latest verification | Read asset inside assigned scope |
| `POST /api/v1/scans` | Record a verification scan | Centre scan permission; `Idempotency-Key` required |
| `POST /api/v1/reports` | Submit damage/repair/out-of-service issue | Report permission in asset scope |
| `POST /api/v1/transfers` | Request asset movement with source/destination | Transfer request permission; approvals are separate actions |
| `POST /api/v1/media/upload-intents` | Request a short-lived private upload URL | Evidence permission for related asset/report |

Scan and transfer writes append audit records in the same database transaction as the business change. Scan retries with the same idempotency key return the original result. Media bytes go directly to private object storage; API records retain metadata and object keys only.

## Error shape

Errors return `{ "statusCode": number, "code": string, "message": string, "requestId": string }`. Do not return database details, object keys, or cross-scope record existence to unauthorized callers.
