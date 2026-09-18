# Ledger

A personal finance dashboard: connects bank/credit accounts via Plaid, syncs
transactions, tracks recurring subscriptions, shows spending by category, and
tracks net worth. Single-user app — see `.env.local.example` for required
configuration.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the values
npm run dev
```

## Database

Schema lives in `supabase/migrations/0001_init.sql`. Apply it via the
Supabase SQL editor, or with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
