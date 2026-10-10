BEGIN;

-- The OIDC identity and organization membership model remain authoritative.
-- Store optional operational contact details, never local passwords or MFA secrets.
ALTER TABLE users ADD COLUMN phone_number text;
ALTER TABLE users ADD CONSTRAINT users_phone_number_length_check
  CHECK (phone_number IS NULL OR length(phone_number) BETWEEN 7 AND 32);

CREATE TABLE permissions (
  permission_key text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_key text NOT NULL CHECK (role_key IN ('head_office','state_head','centre_head','asset_custodian','viewer')),
  permission_key text NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

INSERT INTO permissions (permission_key, description) VALUES
  ('asset:read', 'View assets and their operational records within assigned location scope'),
  ('asset:write', 'Create and update assets and operational records within assigned location scope'),
  ('transfer:create', 'Request asset transfers within assigned location scope'),
  ('transfer:approve', 'Approve or decline transfer requests within assigned location scope'),
  ('handover:execute', 'Record client handover inspections within assigned location scope'),
  ('audit:verify', 'Manage verification cycles and record physical verification scans'),
  ('user:manage', 'Manage user memberships within assigned location scope')
ON CONFLICT (permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions (role_key, permission_key)
SELECT mapping.role_key, permission.permission_key
FROM (VALUES
  ('head_office','asset:read'),('head_office','asset:write'),('head_office','transfer:create'),('head_office','transfer:approve'),('head_office','handover:execute'),('head_office','audit:verify'),('head_office','user:manage'),
  ('state_head','asset:read'),('state_head','asset:write'),('state_head','transfer:create'),('state_head','transfer:approve'),('state_head','handover:execute'),('state_head','audit:verify'),('state_head','user:manage'),
  ('centre_head','asset:read'),('centre_head','asset:write'),('centre_head','transfer:create'),('centre_head','transfer:approve'),('centre_head','handover:execute'),('centre_head','audit:verify'),('centre_head','user:manage'),
  ('asset_custodian','asset:read'),('asset_custodian','asset:write'),('asset_custodian','transfer:create'),('asset_custodian','handover:execute'),('asset_custodian','audit:verify'),
  ('viewer','asset:read')
) AS mapping(role_key, permission_key)
JOIN permissions permission USING (permission_key)
ON CONFLICT DO NOTHING;

-- Avoid duplicate grants, including duplicate organization-wide grants whose scope is NULL.
CREATE UNIQUE INDEX role_assignments_unique_scope_idx
  ON role_assignments (organization_id, user_id, role_key, COALESCE(scope_location_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
