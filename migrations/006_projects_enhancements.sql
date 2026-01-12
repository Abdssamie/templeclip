-- Enhance projects table with timeline state and canvas settings
-- This allows storing complete project state for the template-based editor

-- Add timeline state (current working timeline)
alter table projects add column if not exists timeline_state jsonb default '{}'::jsonb;

-- Add canvas settings (width, height, fps, etc.)
alter table projects add column if not exists canvas_settings jsonb default '{}'::jsonb;

-- Add last opened timestamp for sorting recent projects
alter table projects add column if not exists last_opened_at timestamptz;

-- Add thumbnail reference
alter table projects add column if not exists thumbnail_asset_id uuid references assets(id) on delete set null;

-- Add index for last opened (for "recent projects" queries)
create index if not exists idx_projects_user_last_opened on projects(user_id, last_opened_at desc nulls last);

-- Add GIN index for timeline state queries (if needed for search)
create index if not exists idx_projects_timeline_state on projects using gin(timeline_state);

-- Add GIN index for canvas settings queries
create index if not exists idx_projects_canvas_settings on projects using gin(canvas_settings);

-- Add comments for documentation
comment on column projects.timeline_state is 'Current working timeline state (tracks, scrubbers, transitions)';
comment on column projects.canvas_settings is 'Canvas configuration (width, height, fps, aspectRatio, etc.)';
comment on column projects.last_opened_at is 'Last time project was opened (for recent projects list)';
comment on column projects.thumbnail_asset_id is 'Reference to thumbnail image asset';
