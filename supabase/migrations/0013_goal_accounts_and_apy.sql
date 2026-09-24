-- Two additions. Safe to run more than once.
--
-- 1. APY on connected accounts. Plaid doesn't report a savings account's
--    yield, so it's entered by hand, like the manual Apple Savings APY.
--    Sync only updates balances, so an entered APY is never overwritten.
alter table accounts
  add column if not exists apy numeric check (apy is null or (apy >= 0 and apy <= 100));

-- 2. A goal can follow several accounts at once (their balances add up),
--    connected or manual. Each entry is "plaid:<account id>" or
--    "manual:<account id>". The old single account_id is carried over.
alter table savings_goals
  add column if not exists account_refs text[] not null default '{}';

update savings_goals
  set account_refs = array['plaid:' || account_id::text]
  where account_id is not null and account_refs = '{}';
