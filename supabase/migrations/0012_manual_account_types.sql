-- Apple Savings is a manual account too, so a manual account can be a
-- deposit account as well as a card, and a deposit account can carry its
-- APY. Run after 0011. Safe to run more than once.
alter table manual_accounts drop constraint if exists manual_accounts_type_check;
alter table manual_accounts
  add constraint manual_accounts_type_check check (type in ('credit', 'depository'));

-- Annual percentage yield, as a percent (3.39 means 3.39%). Entered by hand:
-- the transaction export doesn't include it, the statement does.
alter table manual_accounts
  add column if not exists apy numeric check (apy is null or (apy >= 0 and apy <= 100));
