BEGIN;

INSERT INTO permissions (permission_key,description) VALUES
  ('audit:read','View operational audit events within assigned location scope')
ON CONFLICT (permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions (role_key,permission_key) VALUES
  ('head_office','audit:read'),
  ('state_head','audit:read'),
  ('centre_head','audit:read')
ON CONFLICT DO NOTHING;

CREATE INDEX audit_events_org_time_id_idx
  ON audit_events (organization_id,occurred_at DESC,id DESC);

CREATE INDEX locations_org_parent_idx
  ON locations (organization_id,parent_id);

CREATE INDEX assets_org_normalized_serial_location_idx
  ON assets (organization_id,lower(btrim(serial_number)),location_id)
  WHERE serial_number IS NOT NULL AND btrim(serial_number)<>'';

CREATE INDEX condition_reports_open_urgent_idx
  ON condition_reports (organization_id,reported_at DESC,id)
  WHERE urgency='urgent' AND status NOT IN ('resolved','closed');

CREATE TABLE notification_preferences (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('verification','transfers','repairs','data_quality','missing')),
  in_app_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id,category),
  FOREIGN KEY (organization_id,user_id) REFERENCES users(organization_id,id) ON DELETE CASCADE
);

COMMIT;
