BEGIN;

CREATE TABLE notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  notification_key text NOT NULL CHECK (length(notification_key) BETWEEN 1 AND 300),
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
  severity text NOT NULL CHECK (severity IN ('high','medium','low')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  asset_id uuid NOT NULL,
  asset_tag text NOT NULL,
  asset_name text NOT NULL,
  location_name text NOT NULL,
  related_id uuid,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (organization_id, recipient_user_id, notification_key),
  UNIQUE (organization_id, recipient_user_id, id),
  FOREIGN KEY (organization_id, recipient_user_id) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets(organization_id, id)
);

CREATE INDEX notification_inbox_recipient_time_idx
  ON notification_inbox(organization_id, recipient_user_id, created_at DESC, id DESC);
CREATE INDEX notification_inbox_unread_idx
  ON notification_inbox(organization_id, recipient_user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

COMMIT;
