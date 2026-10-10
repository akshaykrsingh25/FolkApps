BEGIN;

ALTER TABLE notification_outbox
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN dead_lettered_at timestamptz;

DROP INDEX IF EXISTS notification_outbox_pending_idx;
CREATE INDEX notification_outbox_pending_idx
  ON notification_outbox(available_at, created_at, id)
  WHERE delivered_at IS NULL AND dead_lettered_at IS NULL;

COMMIT;
