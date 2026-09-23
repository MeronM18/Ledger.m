-- Step 3: monthly budgets, one per spending category. category holds the
-- same key the spending views group by (a PFC primary such as
-- FOOD_AND_DRINK, or OTHER for uncategorized), so a budget lines up with a
-- category total exactly. Same access model as every other table: RLS on,
-- no policies, service-role server code only.

create table budgets (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  monthly_amount numeric not null check (monthly_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table budgets enable row level security;

create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function set_updated_at();
