BEGIN;

CREATE INDEX scan_events_org_cycle_asset_idx
  ON scan_events(organization_id,cycle_id,asset_id);
CREATE INDEX verification_cycles_overdue_idx
  ON verification_cycles(organization_id,grace_ends_at,id)
  WHERE status<>'closed';

COMMIT;
