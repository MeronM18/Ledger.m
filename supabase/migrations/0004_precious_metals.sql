-- Precious metals tracking for /assets: manually-entered holdings priced
-- against a daily-refreshed futures quote. Same RLS-enabled, no-policies,
-- service-role-only pattern as every other table.

create table precious_metal_holdings (
  id uuid primary key default gen_random_uuid(),
  metal text not null check (metal in ('gold', 'silver')),
  weight numeric not null,
  -- Troy oz is standard for precious metals (not the regular ounce) — kept
  -- as an explicit unit rather than always storing troy oz, since a holding
  -- may be labeled in grams (common for bars/coins) and converting at entry
  -- time would lose the user's original input.
  weight_unit text not null check (weight_unit in ('oz', 'g')),
  -- Defaults to 1.0 (assumes fine/pure metal) when unspecified, per the UI's
  -- "assumes fine/pure metal unless purity specified" note.
  purity numeric not null default 1.0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table precious_metal_holdings enable row level security;

create trigger precious_metal_holdings_set_updated_at
  before update on precious_metal_holdings
  for each row execute function set_updated_at();

-- metal_prices ---------------------------------------------------------

-- One row per metal (metal as primary key), upserted on every refresh —
-- this is a cache of the latest quote, not a price history table.
create table metal_prices (
  metal text primary key check (metal in ('gold', 'silver')),
  price_per_troy_oz_usd numeric not null,
  fetched_at timestamptz not null default now(),
  -- Explicit about what kind of price this is (a futures quote, not true
  -- spot) so that distinction survives into anything reading this table
  -- later, not just the fetch code that wrote it.
  source text not null default 'yahoo_finance_futures'
);

alter table metal_prices enable row level security;
