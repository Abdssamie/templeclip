-- Add export metadata columns for UI display
ALTER TABLE exports 
  ADD COLUMN IF NOT EXISTS thumbnail_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;

-- Index for thumbnail lookups
CREATE INDEX IF NOT EXISTS idx_exports_thumbnail ON exports(thumbnail_asset_id);

COMMENT ON COLUMN exports.thumbnail_asset_id IS 'Thumbnail image asset reference';
COMMENT ON COLUMN exports.duration_seconds IS 'Video duration in seconds';
COMMENT ON COLUMN exports.label IS 'User-friendly label: "Timeline" or scene name';
COMMENT ON COLUMN exports.file_size_bytes IS 'Video file size in bytes';
