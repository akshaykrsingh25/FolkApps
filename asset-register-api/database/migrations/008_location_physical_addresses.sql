BEGIN;

ALTER TABLE locations
  ADD COLUMN physical_address text
    CHECK (physical_address IS NULL OR (length(trim(physical_address)) BETWEEN 1 AND 300)),
  ADD COLUMN physical_address_status text NOT NULL DEFAULT 'unverified'
    CHECK (physical_address_status IN ('unverified','centre_head_confirmed','verified'));

CREATE INDEX locations_org_physical_address_status_idx
  ON locations (organization_id, kind, physical_address_status)
  WHERE physical_address IS NOT NULL;

COMMIT;
