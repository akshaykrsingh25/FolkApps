# PostgreSQL query-plan baseline

Captured on 2026-10-10 using the current API query implementations and a disposable local PostgreSQL 16.15 database on Apple Silicon. All migrations through `015_audit_feed_and_notification_preferences.sql` applied successfully.

## Synthetic dataset

- 1 organization, 4 state rows, 64 centres, 256 floors, and 1,024 areas.
- 64,000 assets across the areas; 1,000 marked missing; serials grouped into 32,000 duplicate pairs.
- 4 overdue verification cycles, with no scans, producing 64,000 unseen signals.
- 256 unresolved urgent reports and 100,000 audit events.
- Database size after seeding: approximately 101 MB.

## Warm-cache `EXPLAIN (ANALYZE, BUFFERS)` results

| API query | Rows returned by the API | PostgreSQL execution | Shared reads |
|---|---:|---:|---:|
| Watch, first page | 50 (more available) | 196 ms | 0 blocks |
| Overview | one summary | 43 ms | 0 blocks |
| Map | 64 centres | 44 ms | 0 blocks |
| Audit feed, first page | 50 (more available) | 253 ms | 0 blocks |

The Watch plan used the location/status, scan-cycle, and transfer indexes. The audit plan used the organization/entity/time audit index. Broad map and duplicate-serial aggregation favored scans and hash aggregation for this dataset rather than the optional normalized-serial index.

## Limits and follow-up

These measurements establish a repeatable local baseline; they are not production latency targets. The database was warm, there was no concurrent traffic, and only one organization and one broad Head Office scope were exercised. The Watch query constructs and orders the matching signal set before returning a page, so later pages also repeat that work. Measure against the approved centre directory and representative asset/event volumes before setting service-level targets; if Watch volume or latency exceeds the pilot target, move signal generation to a refreshable persisted queue or optimize per-signal pagination while preserving severity ordering and authorization scope.

Production acceptance still needs concurrent-load testing, real deployment hardware/storage, operational alerting, and the organization-approved data distribution. This baseline is intentionally synthetic and contains no employee, centre, or asset records from Incuspaze.
