BEGIN;

CREATE TYPE asset_ownership_type AS ENUM (
  'INCUSPAZE_OWNED',
  'CLIENT_DEDICATED',
  'VENDOR_LEASED',
  'TRIAL_DEMO'
);

ALTER TABLE assets
  ADD COLUMN ownership_type asset_ownership_type NOT NULL DEFAULT 'INCUSPAZE_OWNED';
CREATE INDEX assets_org_owner_status_idx ON assets(organization_id, ownership_type, status, id);

CREATE TYPE transfer_batch_status AS ENUM (
  'requested',
  'approved',
  'in_transit',
  'received',
  'received_with_discrepancy',
  'rejected',
  'cancelled'
);

CREATE TYPE transfer_batch_item_receipt AS ENUM (
  'pending',
  'accepted',
  'damaged',
  'not_received',
  'cancelled'
);

CREATE TABLE transfer_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  batch_reference text NOT NULL,
  from_location_id uuid NOT NULL,
  to_location_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  approved_by uuid,
  dispatched_by uuid,
  received_by uuid,
  status transfer_batch_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  auto_flag_after timestamptz,
  completed_at timestamptz,
  handover_notes text,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, batch_reference),
  FOREIGN KEY (organization_id, from_location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, to_location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, requested_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, approved_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, dispatched_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, received_by) REFERENCES users(organization_id, id),
  CHECK (from_location_id <> to_location_id),
  CHECK (auto_flag_after IS NULL OR dispatched_at IS NOT NULL)
);

CREATE TABLE transfer_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  receipt_status transfer_batch_item_receipt NOT NULL DEFAULT 'pending',
  scanned_at_receipt timestamptz,
  receipt_discrepancy_note text,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, batch_id, asset_id),
  FOREIGN KEY (organization_id, batch_id) REFERENCES transfer_batches(organization_id, id),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  CHECK (
    (receipt_status IN ('pending','cancelled') AND scanned_at_receipt IS NULL) OR
    (receipt_status IN ('accepted','damaged','not_received') AND scanned_at_receipt IS NOT NULL)
  ),
  CHECK (receipt_status NOT IN ('damaged','not_received') OR length(trim(COALESCE(receipt_discrepancy_note,''))) >= 5)
);

-- An asset cannot be part of two simultaneously open manifests.
CREATE UNIQUE INDEX transfer_batch_items_one_pending_per_asset_idx
  ON transfer_batch_items (organization_id, asset_id) WHERE receipt_status = 'pending';
CREATE INDEX transfer_batches_org_status_time_idx
  ON transfer_batches (organization_id, status, requested_at DESC, id);
CREATE INDEX transfer_batches_overdue_idx
  ON transfer_batches (organization_id, auto_flag_after) WHERE status = 'in_transit';
CREATE INDEX transfer_batches_source_scope_idx
  ON transfer_batches (organization_id, from_location_id, status, requested_at DESC, id);
CREATE INDEX transfer_batches_destination_scope_idx
  ON transfer_batches (organization_id, to_location_id, status, requested_at DESC, id);
CREATE INDEX transfer_batch_items_batch_idx
  ON transfer_batch_items (organization_id, batch_id, id);

COMMIT;
