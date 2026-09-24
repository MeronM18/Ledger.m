-- Apple Savings is a manual account too, so a manual account can be a
-- deposit account as well as a card. Run after 0011.
alter table manual_accounts drop constraint manual_accounts_type_check;
alter table manual_accounts
  add constraint manual_accounts_type_check check (type in ('credit', 'depository'));
