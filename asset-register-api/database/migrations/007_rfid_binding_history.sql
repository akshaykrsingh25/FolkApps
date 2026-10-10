BEGIN;

-- Preserve the lifecycle of physical RFID identifiers. EPCs are never silently
-- recycled within an organization after a tag has been retired.
CREATE TABLE asset_rfid_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  epc text NOT NULL CHECK (
    length(epc) BETWEEN 8 AND 64 AND length(epc) % 2 = 0 AND epc ~ '^[0-9A-Fa-f]+$'
  ),
  bound_at timestamptz NOT NULL DEFAULT now(),
  bound_by uuid,
  retired_at timestamptz,
  retired_by uuid,
  retirement_reason text,
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, bound_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, retired_by) REFERENCES users(organization_id, id),
  CHECK (
    (retired_at IS NULL AND retired_by IS NULL AND retirement_reason IS NULL)
    OR (retired_at IS NOT NULL AND retired_by IS NOT NULL AND length(trim(retirement_reason)) >= 5)
  )
);

-- Keep active and retired EPCs reserved, avoiding accidental tag reuse after
-- replacement, loss, or failed write attempts.
CREATE UNIQUE INDEX asset_rfid_bindings_org_epc_never_reused_idx
  ON asset_rfid_bindings (organization_id, upper(epc));
CREATE UNIQUE INDEX asset_rfid_bindings_one_active_per_asset_idx
  ON asset_rfid_bindings (organization_id, asset_id)
  WHERE retired_at IS NULL;
CREATE INDEX asset_rfid_bindings_asset_history_idx
  ON asset_rfid_bindings (organization_id, asset_id, bound_at DESC);

-- Backfill current assignments from the existing asset register. The creating
-- user is retained when available; historical records may have no known actor.
INSERT INTO asset_rfid_bindings (organization_id, asset_id, epc, bound_at, bound_by)
SELECT organization_id, id, upper(rfid_epc), created_at, created_by
  FROM assets
 WHERE rfid_epc IS NOT NULL;

COMMIT;
