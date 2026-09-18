-- Ledger: initial schema.
-- All access goes through server code using the service-role client, after
-- requireUser() (or webhook signature verification) has passed. RLS is
-- enabled on every table with NO permissive policies, so the anon/browser
-- client can never read or write these tables directly.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- items ----------------------------------------------------------------

create table items (
  id uuid primary key default gen_random_uuid(),
  plaid_item_id text not null unique,
  access_token_encrypted text not null,
  institution_id text,
  institution_name text,
  transactions_cursor text,
  status text not null default 'active',
  error_code text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table items enable row level security;

create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- accounts ---------------------------------------------------------------

create table accounts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  plaid_account_id text not null unique,
  name text not null,
  official_name text,
  mask text,
  type text not null,
  subtype text,
  current_balance numeric,
  available_balance numeric,
  credit_limit numeric,
  iso_currency_code text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;

create index accounts_item_id_idx on accounts(item_id);

create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function set_updated_at();

-- transactions -------------------------------------------------------------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  plaid_transaction_id text not null unique,
  -- Plaid convention: positive amount = money out (debit), negative = money in (credit).
  amount numeric not null,
  iso_currency_code text,
  date date not null,
  authorized_date date,
  datetime timestamptz,
  name text,
  merchant_name text,
  logo_url text,
  website text,
  pfc_primary text,
  pfc_detailed text,
  pfc_confidence text,
  payment_channel text,
  pending boolean not null default false,
  pending_transaction_id text,
  notified_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transactions enable row level security;

create index transactions_date_idx on transactions(date desc);
create index transactions_account_id_date_idx on transactions(account_id, date);
create index transactions_pfc_primary_idx on transactions(pfc_primary);
create index transactions_merchant_name_idx on transactions(merchant_name);

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- recurring_streams ----------------------------------------------------

create table recurring_streams (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null unique,
  account_id uuid not null references accounts(id) on delete cascade,
  direction text not null check (direction in ('inflow', 'outflow')),
  description text,
  merchant_name text,
  frequency text,
  average_amount numeric,
  last_amount numeric,
  first_date date,
  last_date date,
  predicted_next_date date,
  status text not null check (status in ('MATURE', 'EARLY_DETECTION', 'TOMBSTONED', 'UNKNOWN')),
  is_active boolean not null default true,
  pfc_primary text,
  pfc_detailed text,
  transaction_ids text[],
  user_marked_cancelled boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recurring_streams enable row level security;

create index recurring_streams_account_id_idx on recurring_streams(account_id);

create trigger recurring_streams_set_updated_at
  before update on recurring_streams
  for each row execute function set_updated_at();

-- manual_assets ------------------------------------------------------------

create table manual_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('cash', 'crypto', 'vehicle', 'property', 'other')),
  value numeric not null,
  is_liability boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table manual_assets enable row level security;

create trigger manual_assets_set_updated_at
  before update on manual_assets
  for each row execute function set_updated_at();

-- webhook_events -------------------------------------------------------

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  webhook_type text,
  webhook_code text,
  plaid_item_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table webhook_events enable row level security;
