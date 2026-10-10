BEGIN;

-- Store the identifier read from a supported UHF reader. It is an opaque EPC
-- value here: the selected EPC scheme/company prefix is an implementation choice.
ALTER TABLE assets
  ADD COLUMN rfid_epc text;

ALTER TABLE assets
  ADD CONSTRAINT assets_rfid_epc_format_check
  CHECK (rfid_epc IS NULL OR (length(rfid_epc) BETWEEN 8 AND 64 AND length(rfid_epc) % 2 = 0 AND rfid_epc ~ '^[0-9A-Fa-f]+$'));

CREATE UNIQUE INDEX assets_org_rfid_epc_unique_idx
  ON assets (organization_id, upper(rfid_epc))
  WHERE rfid_epc IS NOT NULL;

ALTER TABLE scan_events
  ADD COLUMN identification_method text NOT NULL DEFAULT 'qr'
  CHECK (identification_method IN ('qr','barcode','rfid','manual'));

COMMIT;
