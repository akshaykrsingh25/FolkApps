BEGIN;

CREATE TABLE asset_custodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  custodian_user_id uuid NOT NULL,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issue_condition asset_condition NOT NULL DEFAULT 'good',
  issue_notes text,
  returned_by uuid,
  returned_at timestamptz,
  return_condition asset_condition,
  return_notes text,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, custodian_user_id) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, issued_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, returned_by) REFERENCES users(organization_id, id),
  CHECK ((returned_at IS NULL AND returned_by IS NULL AND return_condition IS NULL) OR
         (returned_at IS NOT NULL AND returned_by IS NOT NULL AND return_condition IS NOT NULL))
);

CREATE UNIQUE INDEX asset_custodies_one_open_per_asset_idx
  ON asset_custodies (organization_id, asset_id) WHERE returned_at IS NULL;
CREATE INDEX asset_custodies_asset_history_idx
  ON asset_custodies (organization_id, asset_id, issued_at DESC, id);

-- Preserve current named custodians as the starting point for the custody timeline.
INSERT INTO asset_custodies (organization_id, asset_id, custodian_user_id, issued_at, issue_condition, issue_notes)
SELECT organization_id, id, custodian_user_id, created_at, condition, 'Imported from the existing asset record during custody-history setup.'
FROM assets
WHERE custodian_user_id IS NOT NULL;

COMMIT;
