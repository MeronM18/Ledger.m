-- Manually-entered transactions (cash purchases, or anything else not
-- captured by a connected bank/card) — separate from the Plaid-sourced
-- transactions table, whose schema assumes Plaid's plaid_transaction_id,
-- pending status, and account_id linkage. Same RLS-enabled, no-policies,
-- service-role-only pattern as every other table.

create table manual_transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  -- Plaid convention: positive amount = money out (debit), negative = money
  -- in (credit) — matches transactions.amount exactly, so the two tables
  -- can be merged into one aggregation without a sign-flip.
  amount numeric not null,
  -- Same PFC-primary taxonomy already used for transactions.pfc_primary
  -- (see plaid-categories.ts) — a fixed dropdown, not free text, so a
  -- manual entry aggregates into /spending's category totals correctly
  -- instead of creating an ungrouped one-off category.
  pfc_primary text not null check (
    pfc_primary in (
      'BANK_FEES', 'ENTERTAINMENT', 'FOOD_AND_DRINK', 'GENERAL_MERCHANDISE',
      'GENERAL_SERVICES', 'GOVERNMENT_AND_NON_PROFIT', 'HOME_IMPROVEMENT',
      'INCOME', 'LOAN_DISBURSEMENTS', 'LOAN_PAYMENTS', 'MEDICAL', 'OTHER',
      'PERSONAL_CARE', 'RENT_AND_UTILITIES', 'TRANSFER_IN', 'TRANSFER_OUT',
      'TRANSPORTATION', 'TRAVEL'
    )
  ),
  -- Free text ("Cash", "Check", ...) — just a label, not aggregated on.
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table manual_transactions enable row level security;

create index manual_transactions_date_idx on manual_transactions(date desc);

create trigger manual_transactions_set_updated_at
  before update on manual_transactions
  for each row execute function set_updated_at();
