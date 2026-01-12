-- Add scenes support to projects table
-- Scenes are stored as JSONB array for flexibility and atomic updates

alter table projects add column if not exists scenes jsonb not null default '[]'::jsonb;

-- Add index for scenes queries (useful for future scene search features)
create index if not exists idx_projects_scenes on projects using gin(scenes);

-- Add comment for documentation
comment on column projects.scenes is 'Array of scene definitions with timeline, variables, and elasticity rules';
