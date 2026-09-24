-- Manual accounts: an account Plaid can't connect (Apple Card), fed by
-- importing the statement CSV. Its transactions live in manual_transactions
-- (so every page that already merges manual + Plaid data picks them up) and
-- are tied to the account here. Same access model as every other table: RLS
-- on, no policies, service-role server code only.

create table manual_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_name text not null,
  type text not null default 'credit' check (type in ('credit')),
  mask text,
  credit_limit numeric check (credit_limit is null or credit_limit > 0),
  -- The balance owed if the user types the real one in. Left null, the
  -- balance is the sum of the imported transactions (purchases positive,
  -- payments negative), which is right when the imports cover the card's
  -- whole life.
  balance_override numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table manual_accounts enable row level security;

create trigger manual_accounts_set_updated_at
  before update on manual_accounts
  for each row execute function set_updated_at();

alter table manual_transactions
  add column manual_account_id uuid references manual_accounts(id) on delete cascade,
  -- Stable id for an imported row, so importing an overlapping statement
  -- again skips what's already there instead of duplicating it.
  add column external_id text,
  add column source text not null default 'manual',
  add constraint manual_transactions_external_unique unique (manual_account_id, external_id);

create index manual_transactions_account_idx on manual_transactions(manual_account_id);
