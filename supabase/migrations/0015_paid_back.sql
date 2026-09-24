-- "Paid back": money someone gave back, in cash, for a charge paid on
-- their behalf. Only your share of the charge counts as spending; the
-- charge itself, the bank data and the Cash asset are left as they are.
-- On transaction_overrides for bank (Plaid) transactions and on
-- manual_transactions for manual and imported ones (Apple Card).
alter table transaction_overrides
  add column if not exists reimbursed_amount numeric check (reimbursed_amount is null or reimbursed_amount > 0);

alter table manual_transactions
  add column if not exists reimbursed_amount numeric check (reimbursed_amount is null or reimbursed_amount > 0);
