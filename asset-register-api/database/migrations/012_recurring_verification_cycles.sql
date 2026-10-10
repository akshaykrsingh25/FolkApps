BEGIN;

CREATE UNIQUE INDEX verification_cycles_policy_start_uq
  ON verification_cycles(organization_id,policy_id,starts_at);

COMMIT;
