BEGIN;

ALTER TABLE verification_cycles
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid,
  ADD COLUMN close_reason text,
  ADD CONSTRAINT verification_cycles_closed_by_fk
    FOREIGN KEY (organization_id,closed_by) REFERENCES users(organization_id,id),
  ADD CONSTRAINT verification_cycles_close_reason_length
    CHECK (close_reason IS NULL OR length(close_reason) BETWEEN 5 AND 500);

CREATE INDEX verification_cycles_active_policy_idx
  ON verification_cycles(organization_id,policy_id,starts_at DESC)
  WHERE policy_id IS NOT NULL AND status<>'closed';

COMMIT;
