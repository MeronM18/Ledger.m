-- Step 4: alert history + dedupe. Every alert (budget, renewal, price
-- increase, low balance) is inserted here first; the unique dedupe_key makes
-- "already told you about this" a database fact, so a retried cron or a
-- second sync never sends the same push twice. Also feeds the overview's
-- recent-alerts card. Same access model as every other table: RLS on, no
-- policies, service-role server code only.

create table alert_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table alert_events enable row level security;

create index alert_events_created_at_idx on alert_events(created_at desc);
