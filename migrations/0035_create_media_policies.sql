-- Create media_retention_policies table
CREATE TABLE media_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  description text,
  days_to_keep integer NOT NULL CHECK (days_to_keep > 0),
  applies_to varchar(20) NOT NULL CHECK (applies_to IN ('draft', 'replaced')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create media_cleanup_log table
CREATE TABLE media_cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES media_retention_policies(id) ON DELETE SET NULL,
  files_deleted integer NOT NULL,
  bytes_freed bigint NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default policies
INSERT INTO media_retention_policies (name, description, days_to_keep, applies_to, is_active)
VALUES
  ('Draft Cleanup', 'Delete draft media older than 90 days', 90, 'draft', true),
  ('Replaced Media Cleanup', 'Delete replaced media older than 30 days', 30, 'replaced', true);
