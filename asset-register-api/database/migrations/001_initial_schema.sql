BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE location_kind AS ENUM ('state','centre','warehouse','building','floor','area');
CREATE TYPE asset_status AS ENUM ('active','unused','in_repair','out_of_service','missing','retired','disposed');
CREATE TYPE asset_condition AS ENUM ('good','fair','damaged','not_working');
CREATE TYPE report_kind AS ENUM ('damaged','needs_repair','not_working','other');
CREATE TYPE report_status AS ENUM ('reported','assigned','in_repair','resolved','closed');
CREATE TYPE cycle_status AS ENUM ('scheduled','open','grace','closed');
CREATE TYPE transfer_status AS ENUM ('draft','requested','approved','in_transit','received','rejected','cancelled');
CREATE TYPE evidence_kind AS ENUM ('asset_photo','invoice','label','condition_photo','handover','other');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  identity_subject text NOT NULL,
  display_name text NOT NULL,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, identity_subject),
  UNIQUE (organization_id, email)
);

CREATE TABLE role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL,
  role_key text NOT NULL CHECK (role_key IN ('head_office','state_head','centre_head','asset_custodian','viewer')),
  scope_location_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id)
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  parent_id uuid,
  kind location_kind NOT NULL,
  code text,
  name text NOT NULL,
  city text,
  state_name text,
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  coordinates_status text NOT NULL DEFAULT 'unverified' CHECK (coordinates_status IN ('unverified','city_level','centre_head_confirmed','verified')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code),
  FOREIGN KEY (organization_id, parent_id) REFERENCES locations(organization_id, id)
);
ALTER TABLE role_assignments ADD CONSTRAINT role_scope_fk FOREIGN KEY (organization_id, scope_location_id) REFERENCES locations(organization_id, id);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid NOT NULL,
  client_request_id uuid,
  qr_public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_tag text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  serial_number text,
  manufacturer text,
  model text,
  status asset_status NOT NULL DEFAULT 'active',
  condition asset_condition NOT NULL DEFAULT 'good',
  custodian_user_id uuid,
  purchase_date date,
  purchase_amount numeric(14,2) CHECK (purchase_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  seller_name text,
  seller_phone text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, client_request_id),
  UNIQUE (organization_id, asset_tag),
  UNIQUE (organization_id, qr_public_id),
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, custodian_user_id) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES users(organization_id, id)
);
CREATE INDEX assets_org_location_status_idx ON assets(organization_id, location_id, status, id);
CREATE INDEX assets_org_category_idx ON assets(organization_id, category, id);
CREATE INDEX assets_org_serial_idx ON assets(organization_id, serial_number) WHERE serial_number IS NOT NULL;

CREATE TABLE warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  coverage_kind text NOT NULL CHECK (coverage_kind IN ('warranty','guarantee','amc','other')),
  provider text,
  service_phone text,
  starts_on date,
  ends_on date,
  terms text,
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id)
);
CREATE INDEX warranties_org_expiry_idx ON warranties(organization_id, ends_on);

CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid,
  kind evidence_kind NOT NULL,
  object_key text NOT NULL,
  original_name text,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES users(organization_id, id)
);

CREATE TABLE evidence_upload_intents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  kind evidence_kind NOT NULL,
  original_name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '20 minutes',
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES users(organization_id, id)
);

CREATE TABLE verification_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  scope_location_id uuid NOT NULL,
  cadence_months smallint NOT NULL DEFAULT 6 CHECK (cadence_months BETWEEN 1 AND 24),
  grace_days smallint NOT NULL DEFAULT 60 CHECK (grace_days BETWEEN 0 AND 180),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, scope_location_id) REFERENCES locations(organization_id, id)
);

CREATE TABLE verification_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  scope_location_id uuid NOT NULL,
  policy_id uuid,
  starts_at timestamptz NOT NULL,
  grace_ends_at timestamptz NOT NULL,
  status cycle_status NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CHECK (grace_ends_at >= starts_at),
  FOREIGN KEY (organization_id, policy_id) REFERENCES verification_policies(organization_id, id),
  FOREIGN KEY (organization_id, scope_location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES users(organization_id, id)
);
CREATE INDEX verification_cycles_org_status_idx ON verification_cycles(organization_id, status, starts_at);

CREATE TABLE scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cycle_id uuid,
  asset_id uuid NOT NULL,
  location_id uuid NOT NULL,
  scanned_by uuid,
  client_event_id uuid NOT NULL,
  scanned_at timestamptz NOT NULL,
  latitude double precision,
  longitude double precision,
  client_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_event_id),
  FOREIGN KEY (organization_id, cycle_id) REFERENCES verification_cycles(organization_id, id),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, scanned_by) REFERENCES users(organization_id, id)
);
CREATE INDEX scan_events_org_cycle_time_idx ON scan_events(organization_id, cycle_id, scanned_at DESC, id);

CREATE TABLE condition_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  kind report_kind NOT NULL,
  status report_status NOT NULL DEFAULT 'reported',
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','high','urgent')),
  description text NOT NULL,
  resolution_notes text,
  reported_by uuid,
  assigned_to uuid,
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, reported_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, assigned_to) REFERENCES users(organization_id, id)
);
CREATE INDEX condition_reports_org_status_time_idx ON condition_reports(organization_id, status, reported_at DESC, id);

CREATE TABLE report_evidence (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  report_id uuid NOT NULL REFERENCES condition_reports(id),
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  PRIMARY KEY (report_id, evidence_id),
  FOREIGN KEY (organization_id, report_id) REFERENCES condition_reports(organization_id, id),
  FOREIGN KEY (organization_id, evidence_id) REFERENCES evidence(organization_id, id)
);

CREATE TABLE transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  from_location_id uuid NOT NULL,
  to_location_id uuid NOT NULL,
  status transfer_status NOT NULL DEFAULT 'draft',
  requested_by uuid,
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  handover_notes text,
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id),
  FOREIGN KEY (organization_id, from_location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, to_location_id) REFERENCES locations(organization_id, id),
  FOREIGN KEY (organization_id, requested_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, approved_by) REFERENCES users(organization_id, id)
);
CREATE INDEX transfer_requests_org_status_time_idx ON transfer_requests(organization_id, status, requested_at DESC, id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES users(organization_id, id)
);
CREATE INDEX audit_events_org_entity_time_idx ON audit_events(organization_id, entity_type, entity_id, occurred_at DESC, id);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text
);
CREATE INDEX notification_outbox_pending_idx ON notification_outbox(created_at, id) WHERE delivered_at IS NULL;

COMMIT;
