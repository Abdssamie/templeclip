-- Create exports table for tracking rendered videos
-- This stores immutable snapshots of what was rendered for reproducibility

create table if not exists exports (
  id uuid primary key,
  user_id text not null,
  project_id uuid references projects(id) on delete cascade,
  
  -- Immutable snapshot of what was rendered
  timeline_data jsonb not null,
  scenes_snapshot jsonb not null,
  variable_values jsonb not null default '{}'::jsonb,
  canvas_settings jsonb not null,
  
  -- Output video reference
  output_asset_id uuid references assets(id) on delete set null,
  
  -- Render status tracking
  render_status text not null default 'queued',
  render_error text,
  render_duration_ms int,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Create render status enum (using check constraint for flexibility)
-- Create render status enum (using check constraint for flexibility)
ALTER TABLE exports DROP CONSTRAINT IF EXISTS exports_render_status_check;
ALTER TABLE exports ADD CONSTRAINT exports_render_status_check 
  CHECK (render_status IN ('queued', 'rendering', 'completed', 'failed', 'cancelled'));

-- Indexes for efficient queries
create index if not exists idx_exports_user_project on exports(user_id, project_id, created_at desc);
create index if not exists idx_exports_status on exports(render_status, created_at) where render_status != 'completed';
create index if not exists idx_exports_user_created on exports(user_id, created_at desc);

-- GIN indexes for searching within snapshots (if needed)
create index if not exists idx_exports_timeline_data on exports using gin(timeline_data);
create index if not exists idx_exports_scenes_snapshot on exports using gin(scenes_snapshot);

-- Comments for documentation
comment on table exports is 'Immutable snapshots of rendered videos with exact timeline/scene data used';
comment on column exports.timeline_data is 'Complete timeline data used for this render (from getTimelineData())';
comment on column exports.scenes_snapshot is 'Snapshot of all scenes used in this render';
comment on column exports.variable_values is 'Variable values used for this specific render';
comment on column exports.canvas_settings is 'Canvas settings (width, height, fps) used for render';
comment on column exports.render_status is 'Render status: queued, rendering, completed, failed, cancelled';
comment on column exports.render_duration_ms is 'Time taken to render in milliseconds';
