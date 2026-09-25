---
version: 1
slug: "src-app-dashboard-page-tsx"
primary_target: "src/app/(dashboard)/page.tsx"
related_targets: []
---

# Overview

Scope: the signed-in home page (`/`). Visitor mode: Operate. Audience: the single owner, on a laptop or phone, checking in after a paycheck lands or a purchase posts. Job: see at a glance how this month is going against the monthly budget, then net worth, what's due soon, and the latest transactions; details live one click away on their own pages. Constraints: every card stays draggable and the order is saved; figures come from the shared ledger so they match Budgets, Spending and Transactions; tones match the rest of the site (the user asked for it).

Pinned by the user: the composition of the FinPi dashboard reference (four headline tiles with a pill strip each, a wide chart beside two stacked cards, a full-width recent-transactions table), rendered in Ledger.m's own dark world.

## Direction contract

THESIS: One composed month-at-a-glance page instead of a stack of twelve same-weight cards; it refuses the equal-card feed and leads with what's left to spend.

OWN-WORLD: Onyx ground, smoke cards with a hairline border, bone text, ash-grey labels; champagne for spending and net worth (as on Spending and Accounts), moss for money in and on-budget states, oxblood only when over; Bodoni Moda for headline figures with small muted cents, Switzer for labels and chips, IBM Plex Mono for table amounts; rounded pill strips as the recurring data mark.

STORY: The owner reads what's left for the month and whether spending is ahead of or under an even pace, sees spending, income and net worth beside it, checks what's due in the next two weeks, and scans the latest transactions, each labeled as spending, income, card payment or transfer.

FIRST VIEWPORT: Greeting and date, and one quiet line only when a bank needs signing in or a statement is due; four equal tiles in a row (Left to spend, Spent this month, Income this month, Net worth), each a serif figure, a small chip and a pill strip; below, an eight-column chart headed by the pace reading (for example "$557 under an even pace") with this month's running total against an even pace to the budget and last month, beside two stacked cards: Upcoming and Where it went. Recent transactions table follows.

FORM: The user-pinned reference layout (pinned, outranks the roll; seed key 1c384f5f was dealt before the pin arrived and is set aside).

Signature interaction: hovering (or arrowing through) the month chart reads out that day: spent so far, where an even pace would be, and last month at the same day. Cards lift and reorder by their grip, which shows on hover on pointer devices.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
