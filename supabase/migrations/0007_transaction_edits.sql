-- Step 2: user edits layered on top of Plaid data. Nothing here ever
-- rewrites a transactions row: Plaid re-syncs (cursor sync upserts by
-- plaid_transaction_id) would clobber it, and the original values are worth
-- keeping. Edits are resolved at read time (src/lib/transaction-edits.ts).
--
-- Same access model as every other table: RLS on, no policies, service-role
-- server code only.

-- One row per hand-edited transaction. Any column left null means "no edit
-- for that field". transaction_id references the internal transactions.id,
-- which is stable across syncs (upsert keeps the row); a pending charge that
-- posts arrives as a new Plaid transaction id and starts without an edit.
create table transaction_overrides (
  transaction_id uuid primary key references transactions(id) on delete cascade,
  category text,
  merchant_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transaction_overrides enable row level security;

create trigger transaction_overrides_set_updated_at
  before update on transaction_overrides
  for each row execute function set_updated_at();

-- "Always treat anything containing X as Y". Matched case-insensitively as a
-- substring of the transaction's merchant name / raw name, the longest match
-- text winning. A per-transaction override beats a rule.
create table merchant_rules (
  id uuid primary key default gen_random_uuid(),
  match_text text not null check (length(btrim(match_text)) >= 2),
  rename_to text,
  category text,
  created_at timestamptz not null default now(),
  check (rename_to is not null or category is not null)
);

alter table merchant_rules enable row level security;
