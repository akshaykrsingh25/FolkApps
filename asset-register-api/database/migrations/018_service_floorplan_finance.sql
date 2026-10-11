BEGIN;
CREATE TABLE service_tickets (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,asset_id uuid NOT NULL,created_by uuid NOT NULL,
 vendor text NOT NULL CHECK(length(vendor) BETWEEN 1 AND 160),contract_reference text NOT NULL CHECK(length(contract_reference) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 2000),
 ack_hours integer NOT NULL CHECK(ack_hours BETWEEN 1 AND 8760),resolution_hours integer NOT NULL CHECK(resolution_hours BETWEEN ack_hours AND 8760),
 credit_per_hour numeric(12,2) NOT NULL CHECK(credit_per_hour>=0),credit_cap numeric(12,2) NOT NULL CHECK(credit_cap>=0),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),acknowledged_at timestamptz,resolved_at timestamptz,
 approved_credit numeric(12,2),approved_by uuid,credit_reason text,
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,asset_id) REFERENCES assets(organization_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id),
 FOREIGN KEY(organization_id,approved_by) REFERENCES users(organization_id,id)
);
CREATE INDEX service_tickets_due ON service_tickets(organization_id,created_at) WHERE status<>'resolved';
CREATE TABLE indoor_plans (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,floor_id uuid NOT NULL,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 rooms jsonb NOT NULL CHECK(jsonb_typeof(rooms)='array'),created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),FOREIGN KEY(organization_id,floor_id) REFERENCES locations(organization_id,id),FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id)
);
CREATE INDEX indoor_plans_floor ON indoor_plans(organization_id,floor_id,created_at DESC);
CREATE TABLE depreciation_batches (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,created_by uuid NOT NULL,period_end date NOT NULL,
 policy_reference text NOT NULL CHECK(length(policy_reference) BETWEEN 1 AND 200),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','exported','reconciled')),
 approved_by uuid,external_reference text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id),FOREIGN KEY(organization_id,approved_by) REFERENCES users(organization_id,id)
);
COMMIT;
