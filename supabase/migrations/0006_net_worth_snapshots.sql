-- Daily net worth history, computed via the same computeNetWorth() formula
-- /assets and /overview already use — one row per calendar day (America/New
-- York, this app's one real user's timezone), inserted by a daily cron and
-- upserted on conflict so re-running the job the same day corrects that
-- day's figure instead of accumulating duplicates. Same RLS-enabled,
-- no-policies, service-role-only pattern as every other table.

create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_assets numeric not null,
  total_liabilities numeric not null,
  net_worth numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table net_worth_snapshots enable row level security;

create index net_worth_snapshots_date_idx on net_worth_snapshots(date desc);

create trigger net_worth_snapshots_set_updated_at
  before update on net_worth_snapshots
  for each row execute function set_updated_at();
