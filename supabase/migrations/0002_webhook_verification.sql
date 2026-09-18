-- Track whether a webhook's Plaid-Verification signature was validated.
alter table webhook_events add column verified boolean;
