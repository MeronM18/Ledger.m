-- Small per-user display preferences that should follow the user across
-- devices, like the order of the cards on the Accounts page. One row per
-- preference, keyed by name. Same access model as every other table: RLS on,
-- no policies, service-role server code only.

create table ui_preferences (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table ui_preferences enable row level security;

create trigger ui_preferences_set_updated_at
  before update on ui_preferences
  for each row execute function set_updated_at();
