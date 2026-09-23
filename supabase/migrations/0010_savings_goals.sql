-- Step 9: savings goals. Progress is either tracked by hand (saved_amount,
-- bumped with "add money") or, when account_id is set, follows that
-- account's balance so it can't drift from reality. Same access model as
-- every other table: RLS on, no policies, service-role server code only.

create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  target_amount numeric not null check (target_amount > 0),
  saved_amount numeric not null default 0 check (saved_amount >= 0),
  target_date date,
  -- Optional: track a connected account's balance instead of saved_amount.
  -- The goal outlives the account (on delete set null falls back to manual).
  account_id uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table savings_goals enable row level security;

create trigger savings_goals_set_updated_at
  before update on savings_goals
  for each row execute function set_updated_at();
