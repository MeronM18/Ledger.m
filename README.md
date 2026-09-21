# Ledger.m

A personal finance system, not a budgeting app with a net-worth widget bolted on. It connects directly to real bank and credit accounts via Plaid, computes net worth in real time across connected accounts, manual assets, and precious metals, categorizes and analyzes spending, and tracks recurring subscriptions and income — all inside a custom-built dashboard secured for exactly one user.

This is a private, single-user application. It is not built or positioned as multi-tenant SaaS — the scope, the auth model, and the infrastructure choices all reflect that deliberately.

## Core capabilities

**Banking & sync**
- Plaid Link integration across multiple financial institutions simultaneously, each tracked independently (connection status, last sync, error state, available transaction history)
- Real-time transaction sync via Plaid webhooks (`TRANSACTIONS` / `SYNC_UPDATES_AVAILABLE`), using Plaid's cursor-based `/transactions/sync` model, with a daily cron job as a backstop in case a webhook is ever missed
- Webhook-verified item status handling — a `ITEM_LOGIN_REQUIRED` or other error webhook updates that institution's status and surfaces it in the UI, rather than silently going stale
- Display-layer transaction cleanup built from a real audit of live transaction data: strips ACH/wire boilerplate and reference numbers, expands bank abbreviations, and detects payroll deposits and P2P transfer services (PayPal, Venmo, Cash App, Zelle, Apple Cash) by pattern, correcting cases where Plaid's own categorization gets a transfer wrong

**Spending**
- Category totals by month, top merchants, and a dedicated refunds view — refunds net against their category's total (the economically correct "what did I actually spend") while remaining individually traceable, never silently absorbed
- Search, account/category/month filtering, and a sortable transaction table
- CSV export of exactly the currently-filtered transaction set — not always the full history — with manual entries clearly marked

**Income**
- Income-by-source breakdown (paycheck vs. everything else), reusing the same payroll-detection logic the transaction display already uses
- A monthly income-vs-spending comparison, computed from the same underlying transaction data as the spending views

**Subscriptions**
- Plaid's recurring-transaction detection combined with manually-tracked subscriptions in one unified view
- Active/cancelled state, with monthly and annualized cost totals
- Price-increase detection — flags a subscription whose most recent charge is meaningfully above its rolling average, not just any variance
- Lapsed-subscription detection — flags an active subscription whose predicted charge date has passed with no new matching transaction, a signal most finance apps don't compute at all

**Net worth**
- Real-time net worth across connected accounts, manually tracked assets/liabilities, and precious metals holdings
- Daily snapshot history via a scheduled job, with a trend chart that only renders once there's enough history to mean something — a single data point gets an honest "building history" state instead of a misleading chart

**Assets**
- Manual asset and liability tracking (cash, crypto, vehicles, property, other)
- Precious metals holdings by weight and purity, valued continuously against live gold/silver spot prices, refreshed daily

**Manual entry**
- Manual transactions share the exact same category taxonomy as Plaid-sourced ones, so they aggregate into the same spending totals, search, and CSV export — not a second-class, bolted-on data source
- Logging a manual transaction against a cash payment method automatically adjusts a running Cash asset balance, incrementally, at write time
- Manual subscriptions and manual assets are both fully editable and deletable, not just insert-only

**Notifications**
- Real-time push notifications (via ntfy) fired when new transactions land through a webhook sync

## Architecture

- **Next.js 16** (App Router, Server Components, Proxy for request-time auth), **React 19**, **TypeScript**, **Tailwind v4**, **shadcn/ui**
- **Supabase (Postgres)** — eleven tables, row-level security enabled on every one of them with zero permissive policies; all data access goes through a service-role client from trusted server code, never from the browser
- **Plaid** — Link, transaction sync, recurring-transaction detection, and webhook-driven updates
- **Vercel** — deployment target, with three cron-scheduled background jobs: daily transaction sync (backstop), daily precious-metal price refresh, and a daily net-worth snapshot
- **recharts** for spending and net-worth visualization, with a fixed per-category color assignment so a given category is never re-colored just because the set of categories present changes

## Security

This app holds real bank credentials for one real person, so the auth model is deliberately layered rather than relying on any single check:

- Plaid access tokens are encrypted at rest with **AES-256-GCM** before they're ever written to the database
- Every incoming Plaid webhook is cryptographically verified (ES256 JWT signature over the raw request body, per Plaid's own webhook-verification spec) before anything in its payload is trusted or acted on
- Exactly one email address is allowed to hold a session, enforced at **two independent layers**: the Next.js Proxy rejects a wrong-email session before any page renders, and every Server Component page and API route re-checks it again independently — neither layer depends on the other being correct
- The magic-link sign-in endpoint checks that allowlist server-side *before* ever contacting Supabase, so no one else can even trigger a login email, let alone a session
- Every route capable of creating a Plaid Item or otherwise calling the Plaid API is gated by that same allowlist check, independent of the page-level and Proxy-level checks — a real, valid, but wrong-email session gets rejected there specifically, not just redirected elsewhere in the app
- Cron-only endpoints authenticate via a separate bearer-token secret, entirely outside the user session model

## What makes this different from a typical personal finance app

- **One calculation, used everywhere it's needed.** Net worth, category totals, subscription active/inactive status, and income splits are each computed by a single shared, pure function, reused identically by every page that displays them. This codebase has already hit — and fixed — the alternative failure mode: two pages quietly disagreeing about net worth because each recomputed it slightly differently. The architecture now makes that class of bug structurally harder to reintroduce, not just something to remember to avoid.
- **Manual data is first-class, not bolted on.** A manually logged transaction, subscription, or asset shares the exact same category taxonomy, aggregation logic, and UI components as Plaid-sourced data. It shows up in the same totals, the same search, and the same export — never a second, parallel system that has to be kept in sync by hand.
- **Errors look like errors.** A failed query renders a visible, distinct error state instead of quietly falling back to an empty list — a genuinely empty account and a broken database connection are never visually indistinguishable.
- **Every feature is verified against live data before it's considered done.** Not "the build passed" — the real connected accounts, the real transaction history, the real subscription list, checked directly against what the code actually produces.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the values
npm run dev
```

### Database

Schema lives in `supabase/migrations/`. Apply it with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
