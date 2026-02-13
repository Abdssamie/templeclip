-- Add timeline and text_bin_items columns to projects table
-- This migration moves timeline data from filesystem to database for persistence

-- Add timeline column (stores TimelineState with tracks, scrubbers, transitions)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS timeline jsonb DEFAULT NULL;

-- Add text_bin_items column (stores MediaBinItem array)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS text_bin_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Drop the old timeline_state column (was never used, replaced by timeline)
ALTER TABLE projects DROP COLUMN IF EXISTS timeline_state;

-- Drop old index if it exists
DROP INDEX IF EXISTS idx_projects_timeline_state;

-- Add GIN indexes for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_projects_timeline ON projects USING gin(timeline);
CREATE INDEX IF NOT EXISTS idx_projects_text_bin_items ON projects USING gin(text_bin_items);

-- Add comments for documentation
COMMENT ON COLUMN projects.timeline IS 'Timeline state with tracks, scrubbers, and transitions (TimelineState type)';
COMMENT ON COLUMN projects.text_bin_items IS 'Array of text bin items (MediaBinItem[] type)';
