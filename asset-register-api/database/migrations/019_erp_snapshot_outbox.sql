BEGIN;
CREATE TABLE erp_snapshot_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,batch_id uuid NOT NULL,
 payload jsonb NOT NULL,payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sending','delivered','failed')),
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,
 external_reference text,last_error text,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,
 UNIQUE(organization_id,batch_id),FOREIGN KEY(organization_id,batch_id) REFERENCES depreciation_batches(organization_id,id)
);
CREATE INDEX erp_snapshot_due ON erp_snapshot_jobs(next_attempt_at) WHERE status IN('queued','sending');
COMMIT;
