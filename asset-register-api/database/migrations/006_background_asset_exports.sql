BEGIN;

INSERT INTO permissions (permission_key, description)
VALUES ('asset:export', 'Create and download scoped asset register exports')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_key, permission_key)
VALUES ('head_office', 'asset:export'), ('state_head', 'asset:export'), ('centre_head', 'asset:export')
ON CONFLICT DO NOTHING;

CREATE TABLE asset_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  scope_location_id uuid,
  client_request_id uuid NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'expired')),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  result_object_key text,
  result_sha256 char(64),
  result_bytes bigint CHECK (result_bytes IS NULL OR result_bytes >= 0),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, requested_by, client_request_id),
  FOREIGN KEY (organization_id, requested_by) REFERENCES users (organization_id, id),
  FOREIGN KEY (organization_id, scope_location_id) REFERENCES locations (organization_id, id),
  CHECK (
    (status = 'completed' AND result_object_key IS NOT NULL AND result_sha256 IS NOT NULL AND result_bytes IS NOT NULL AND expires_at IS NOT NULL)
    OR status <> 'completed'
  ),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);

CREATE INDEX asset_export_jobs_queue_idx
  ON asset_export_jobs (created_at, id)
  WHERE status = 'queued';

CREATE INDEX asset_export_jobs_lease_idx
  ON asset_export_jobs (lease_expires_at, created_at, id)
  WHERE status = 'running';

CREATE INDEX asset_export_jobs_requester_idx
  ON asset_export_jobs (organization_id, requested_by, created_at DESC, id);

COMMIT;
