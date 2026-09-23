# Ledger.m

Ledger.m is a personal finance system built for exactly one user. It connects directly to real bank and credit accounts via Plaid, computes net worth in real time across connected accounts, manual assets, and precious metals, and tracks spending, subscriptions, and income, all inside a dashboard built from scratch and locked down to a single allowlisted login.

Not a budgeting app with a net-worth widget bolted on, and not dressed up as multi-tenant SaaS either. It's a household of one, and the architecture says so.

## Getting Started

### Prerequisites

- Node.js `>=20.9.0` and npm
- A [Supabase](https://supabase.com) project (Postgres + Auth) and the [Supabase CLI](https://supabase.com/docs/guides/cli)
- A [Plaid](https://dashboard.plaid.com/team/keys) developer account (client ID + secret)
- A [GoldAPI.io](https://www.goldapi.io/dashboard) key, for live precious-metal spot prices
- An [ntfy.sh](https://ntfy.sh) topic, for push notifications
- A [Vercel](https://vercel.com) account, if you're deploying rather than only running locally (needed for the cron jobs)

### Installation

```bash
git clone <repo-url>
cd Ledger.m
npm install
cp .env.local.example .env.local   # fill in Plaid / Supabase / ntfy / GoldAPI values
```

Apply the database schema:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### Usage

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with the one email address set in `ALLOWED_EMAIL`. Anyone else gets the same generic "check your email" response and never reaches Supabase, let alone Plaid. That's not a bug, that's the whole point.

## Tech Stack

- **Next.js 16** (App Router, Server Components, Proxy for request-time auth)
- **React 19**, **TypeScript**, **Tailwind v4**, **shadcn/ui**
- **Supabase** (Postgres + Auth), row-level security on every table
- **Plaid** (Link, transaction sync, recurring-transaction detection, webhooks)
- **Vercel** for deployment and cron-scheduled background jobs
- **recharts** for spending and net-worth visualization

## Features

**Banking & sync**
- Plaid Link across multiple financial institutions at once, each tracked independently (connection status, last sync, error state, available history)
- Real-time transaction sync via Plaid webhooks, cursor-based, with a daily cron job standing by in case a webhook ever goes missing
- Item-level error handling: an `ITEM_LOGIN_REQUIRED` webhook updates that institution's status and surfaces it in the UI instead of quietly going stale
- Transaction-name cleanup built from a real audit of live data: strips ACH/wire boilerplate, expands bank abbreviations, detects payroll deposits and P2P transfers (PayPal, Venmo, Cash App, Zelle, Apple Cash)

**Spending**
- Category totals by month, top merchants, and a dedicated refunds view (refunds net against their category while staying individually traceable, never silently absorbed)
- Pace against last month (compared at the same day of the month, so a half-finished month isn't judged against a full one), the categories that changed most, and click-through from a category to its transactions
- Search, account/category/month filtering, sortable transaction table
- CSV export of exactly the currently-filtered set, not always the full history, manual entries clearly marked

**Income**
- Income-by-source breakdown (paycheck vs. everything else)
- Monthly income-vs-spending comparison

**Subscriptions**
- Plaid's recurring-transaction detection plus manually-tracked subscriptions, one unified view
- Active/cancelled state, monthly and annualized cost totals
- Price-increase detection (a charge meaningfully above its rolling average, not just any variance)
- Lapsed-subscription detection (a predicted charge date that's come and gone with nothing new to show for it)

**Budgets**
- Monthly budget per spending category, with progress against the month, what's left or over, a warning when the month's pace will overshoot, spending that has no budget yet, and a suggested starting amount from your last three months

**Net worth**
- Real-time, across connected accounts, manual assets/liabilities, and precious metals
- Daily snapshot history with a trend chart that waits for enough history to mean something instead of plotting a single point and calling it a trend

**Assets**
- Manual asset and liability tracking (cash, crypto, vehicles, property, other)
- Precious metals by weight and purity, valued against live gold/silver spot prices, refreshed daily

**Editing**
- Rename a transaction, recategorize it, or add a note without touching the stored bank data. "Apply to every matching transaction" saves a merchant rule that also covers past and future charges; a per-transaction edit always beats a rule

**Manual entry**
- Manual transactions share the exact same category taxonomy as Plaid-sourced ones, so they land in the same totals, search, and export instead of a second-class shadow system
- A manual transaction logged against a cash payment method adjusts a running Cash asset balance automatically
- Manual subscriptions and assets are fully editable and deletable, not insert-only

**Notifications**
- Push notifications (via ntfy) fire on new transactions synced through a webhook, so a card swipe shows up on a phone before the receipt does

## Security

This app holds real bank credentials for one real person, so nothing here leans on a single check to carry the whole thing:

- Plaid access tokens encrypted at rest with **AES-256-GCM** before they're ever written to the database
- Every incoming Plaid webhook cryptographically verified (ES256 JWT signature over the raw request body) before anything in it is trusted
- Exactly one email address allowed to hold a session, enforced at **two independent layers**: the Next.js Proxy rejects a wrong-email session before any page renders, and every Server Component page and API route checks again on its own
- The magic-link sign-in endpoint checks that allowlist server-side before ever contacting Supabase, so no one else can trigger a login email in the first place
- Every route capable of creating a Plaid Item or calling the Plaid API is gated by that same allowlist check, independent of the page and Proxy checks
- Cron-only endpoints authenticate via a separate bearer-token secret, entirely outside the user session model

Paranoid, for an app with exactly one user? Maybe. But that user's real bank accounts are on the other end of it, and a Plaid Trial plan doesn't forgive a stranger accidentally burning an Item.

## Engineering notes

- **One calculation, used everywhere it's needed.** Net worth, category totals, subscription status, and income splits are each computed by a single shared, pure function, reused identically by every page that shows them. This codebase already hit, and fixed, the alternative: two pages quietly disagreeing about net worth because each recomputed it slightly differently.
- **Manual data is first-class, not bolted on.** A manually logged transaction, subscription, or asset shares the same taxonomy, aggregation logic, and UI as Plaid-sourced data. Same totals, same search, same export, no parallel system to keep in sync by hand.
- **Errors look like errors.** A failed query renders a visible, distinct error state instead of quietly falling back to an empty list. A genuinely empty account and a broken database connection are never allowed to look the same.

## Testing

`npm test` runs a unit suite (Vitest) over the pure money and date logic: spending and income aggregation, net worth, subscription dates, the paginated-read helper, and the Eastern-time helpers. Every change also goes through `npm run lint` and `npm run build`, then gets verified against the real, live, connected accounts before it's considered done: real transaction history, real subscription list, real net worth. The suite covers the calculations; the live check covers everything that depends on real Plaid data.

## Contribution Guidelines

This is a private, single-user project and isn't looking for outside contributions or issues. If you're reading the code for ideas, help yourself.

## License

No license is granted. This is a private repository for personal use, not published for reuse or redistribution.
