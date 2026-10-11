BEGIN;
CREATE TABLE asset_completion_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 asset_id uuid NOT NULL, assigned_to uuid NOT NULL, created_by uuid NOT NULL,
 due_at timestamptz NOT NULL, notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,asset_id) REFERENCES assets(organization_id,id),
 FOREIGN KEY(organization_id,assigned_to) REFERENCES users(organization_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id)
);
CREATE UNIQUE INDEX asset_completion_one_open ON asset_completion_tasks(organization_id,asset_id) WHERE status='open';
CREATE INDEX asset_completion_due ON asset_completion_tasks(due_at) WHERE status='open';
COMMIT;
