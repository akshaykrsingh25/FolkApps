BEGIN;

ALTER TABLE assets
  ADD COLUMN visual_hash text CHECK (visual_hash IS NULL OR visual_hash ~ '^[0-9a-f]{16}$');

ALTER TABLE evidence
  ADD COLUMN visual_hash text CHECK (visual_hash IS NULL OR visual_hash ~ '^[0-9a-f]{16}$');

ALTER TABLE evidence_upload_intents
  ADD COLUMN visual_hash text CHECK (visual_hash IS NULL OR visual_hash ~ '^[0-9a-f]{16}$');

CREATE TABLE asset_visual_hash_bands (
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  band smallint NOT NULL CHECK (band BETWEEN 0 AND 7),
  band_hash smallint NOT NULL CHECK (band_hash BETWEEN 0 AND 255),
  PRIMARY KEY (organization_id, asset_id, band),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX asset_visual_hash_bands_lookup_idx
  ON asset_visual_hash_bands (organization_id, band, band_hash, asset_id);

COMMIT;
