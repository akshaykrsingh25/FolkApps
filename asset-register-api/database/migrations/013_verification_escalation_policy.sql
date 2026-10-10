BEGIN;

ALTER TABLE verification_policies
  ADD COLUMN escalation_interval_days smallint NOT NULL DEFAULT 7
  CHECK (escalation_interval_days BETWEEN 1 AND 90);

COMMIT;
