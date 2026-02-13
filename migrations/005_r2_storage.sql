-- Add R2 storage support to assets table
-- This migration adds R2-specific columns while maintaining backward compatibility

-- Add R2 storage columns
alter table assets add column if not exists r2_bucket text null;
alter table assets add column if not exists r2_key text null;

-- Add upload status tracking
do $$
begin
  if not exists (select 1 from pg_type where typname = 'upload_status_enum') then
    create type upload_status_enum as enum ('pending', 'uploading', 'completed', 'failed');
  end if;
exception when duplicate_object then
  null;
end $$;

alter table assets add column if not exists upload_status upload_status_enum default 'completed';

-- Make storage_key nullable (for R2-only assets)
alter table assets alter column storage_key drop not null;

-- Add index for R2 key lookups
create index if not exists idx_assets_r2_key on assets(r2_key) where r2_key is not null;

-- Add index for upload status
create index if not exists idx_assets_upload_status on assets(upload_status) where upload_status != 'completed';

-- Add comment for documentation
comment on column assets.r2_bucket is 'Cloudflare R2 bucket name (null for local storage)';
comment on column assets.r2_key is 'R2 object key in format: userId/assetId/filename';
comment on column assets.upload_status is 'Upload status: pending, uploading, completed, failed';
