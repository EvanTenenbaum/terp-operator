-- Create batch_media table
CREATE TABLE batch_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,

  -- File information
  file_path text NOT NULL,
  original_filename varchar(255) NOT NULL,
  file_size bigint NOT NULL,
  mime_type varchar(100) NOT NULL,
  thumbnail_path text,
  medium_path text,

  -- Media classification
  media_type varchar(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
  role varchar(30) NOT NULL DEFAULT 'additional' CHECK (role IN ('primary_photo', 'primary_video', 'additional')),

  -- Status & lifecycle
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  replaced_at timestamptz,
  replaced_by uuid REFERENCES batch_media(id) ON DELETE SET NULL,

  -- Metadata
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX batch_media_batch_idx ON batch_media(batch_id);
CREATE INDEX batch_media_status_idx ON batch_media(status);
CREATE INDEX batch_media_role_idx ON batch_media(role);
CREATE INDEX batch_media_replaced_idx ON batch_media(replaced_at) WHERE replaced_at IS NOT NULL;
CREATE INDEX batch_media_created_idx ON batch_media(created_at);
CREATE INDEX batch_media_uploaded_by_idx ON batch_media(uploaded_by);

-- Unique constraints for primary media
CREATE UNIQUE INDEX batch_media_primary_photo_unique
  ON batch_media(batch_id)
  WHERE role = 'primary_photo' AND status = 'published' AND replaced_at IS NULL;

CREATE UNIQUE INDEX batch_media_primary_video_unique
  ON batch_media(batch_id)
  WHERE role = 'primary_video' AND status = 'published' AND replaced_at IS NULL;
