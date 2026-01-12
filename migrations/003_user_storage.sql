-- Add materialized view for user storage (for performance)
-- This view aggregates storage usage per user from the assets table

create materialized view if not exists user_storage as
select
  user_id,
  sum(size_bytes) as total_storage_bytes,
  count(*) as total_files
from assets
where deleted_at is null
group by user_id;

create unique index if not exists idx_user_storage_user_id on user_storage(user_id);

-- Refresh function (call this periodically or after asset changes)
create or replace function refresh_user_storage()
returns void as $$
begin
  refresh materialized view concurrently user_storage;
end;
$$ language plpgsql;
