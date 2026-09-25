# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person, the owner, and no one else: sign-in is locked to a single allowlisted email. The owner checks it on a laptop and on a phone, often right after a paycheck lands or a purchase posts, to see where the month stands and where the money is.

## Product Purpose

Ledger.m is a personal finance system for exactly one user. It shows what the owner has (net worth across connected accounts, manual assets such as a vehicle, and precious metals), what they spend against the monthly budget they set, what their cards earn, what recurs, and how their savings goals are moving. Success is trusting the numbers enough to act on them: staying within the month's budget and moving money toward goals after each paycheck.

## Positioning

Not a budgeting app with a net-worth widget bolted on, and not multi-tenant SaaS: a household of one, built around this user's real accounts and habits. Income is commission pay that varies from check to check, so nothing assumes a fixed paycheck; money counts once it lands.

## Operating Context

- Accounts: connected through Plaid (checking, a high-yield savings account, Chase Sapphire Preferred and Freedom Flex cards), plus Apple Card and Apple Savings imported from statement CSVs, plus cash and assets entered by hand.
- Rhythm: after a paycheck the owner moves a varying amount from checking into savings toward their goals; both savings accounts earn interest.
- Every page reads one ledger, so a month's spending is the same number on Overview, Budgets, Spending, Transactions and Cash flow.

## Capabilities and Constraints

- Net worth, with a dated history and a per-day breakdown.
- A monthly spending budget split into category budgets that must fit inside it; the rest is "Everything else". The Budgets page never suggests raising a budget.
- Transactions are told apart as spending, income, card payments and transfers; card payments name the card they paid.
- Card rewards per purchase (Sapphire Preferred, Freedom Flex quarterly categories, Apple Card Daily Cash).
- Recurring charges and subscription price changes; savings goals that follow accounts, with pace and monthly plans.
- Push alerts through ntfy; names, thresholds and alert choices set in Settings.
- Stack: Next.js 16 app router, React 19, Tailwind v4, shadcn/ui, Supabase, Plaid, Recharts, deployed on Vercel.
- Undecided: an automatic credit score (parked on the roadmap).

## Brand Commitments

- Name: Ledger.m.
- Voice: plain, specific sentences about the owner's own money; no hype, no jargon, no gamification.

## Evidence on Hand

Real account data only, in production. Tests and previews run on synthetic fixture data (`e2e/fixtures.mjs`). No testimonials, customers or marketing claims exist or should be invented.

## Product Principles

1. Accuracy before everything: the same figure reads the same everywhere, and every total can be traced to its transactions.
2. Help the owner stay within the budget they set, rather than nudging the budget up.
3. Show what to do next, in the owner's own terms: what's left, what's due, what's off.
4. Enough on each screen and no more; details live one click away.
