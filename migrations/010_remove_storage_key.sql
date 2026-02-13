-- Remove storage_key column from assets table
-- This column was used for filesystem storage which is now deprecated in favor of R2

-- Drop the unique index on storage_key first
DROP INDEX IF EXISTS idx_assets_user_storage_key;

-- Drop the storage_key column
ALTER TABLE assets DROP COLUMN IF EXISTS storage_key;

