-- Manually-entered subscriptions (e.g. paid via a card Plaid can't connect,
-- like Apple Card) — separate from recurring_streams, whose schema assumes
-- Plaid's stream_id/transaction_ids/status fields. Same RLS-enabled,
-- no-policies, service-role-only pattern as every other table.

create table manual_subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  frequency text not null check (frequency in ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'ANNUALLY')),
  next_billing_date date,
  notes text,
  -- No separate user_marked_cancelled distinction: unlike a Plaid stream,
  -- there's no upstream is_active status to preserve alongside a manual
  -- override, so cancelling one of these just flips this field directly.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table manual_subscriptions enable row level security;

create trigger manual_subscriptions_set_updated_at
  before update on manual_subscriptions
  for each row execute function set_updated_at();
