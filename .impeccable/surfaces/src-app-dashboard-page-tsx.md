---
version: 1
slug: "src-app-dashboard-page-tsx"
primary_target: "src/app/(dashboard)/page.tsx"
related_targets: []
---

# Overview

Scope: the signed-in home page (`/`). Visitor mode: Operate. Audience: the single owner, on a laptop or phone, checking in after a paycheck lands or a purchase posts. Job: see at a glance how this month is going against the monthly budget, then net worth, what's due soon, and the latest transactions; details live one click away on their own pages. Constraints: every card stays draggable and the order is saved; figures come from the shared ledger so they match Budgets, Spending and Transactions; tones match the rest of the site (the user asked for it).

Pinned by the user: first the FinPi dashboard reference, then (after a live look at gaps left by rearranging) three more: Fintrack (KPI tiles with a footer strip, a cards column with a pill strip against a monthly limit, a cash-flow chart, a transaction table), Finexy and FinScope (a wide main column beside a column of stacked cards). Rendered in Ledger.m's own dark world, in the site's own tones.

## Direction contract

THESIS: One composed month-at-a-glance page instead of a stack of twelve same-weight cards; it refuses the equal-card feed and leads with what's left to spend.

OWN-WORLD: Onyx ground, smoke cards with a hairline border, bone text, ash-grey labels; champagne for spending and net worth (as on Spending and Accounts), moss for money in and on-budget states, oxblood only when over; Bodoni Moda for headline figures with small muted cents, Switzer for labels and chips, IBM Plex Mono for table amounts; rounded pill strips as the recurring data mark.

STORY: The owner reads what's left for the month and whether spending is ahead of or under an even pace, sees spending, income and net worth beside it, checks what's due in the next two weeks, and scans the latest transactions, each labeled as spending, income, card payment or transfer.

FIRST VIEWPORT: Greeting and date, and one quiet line only when a bank needs signing in or a statement is due. Then two columns that end level: the main column opens with three headline tiles (Net worth, Spent this month, Income this month: a serif figure over a hairline footer with the comparison and a quiet chip), then the month chart headed by the pace reading (for example "$557 under an even pace"), running total day by day against an even pace to the budget and last month, or money in against spending by month; the side column opens with Left to spend (what's left, a day's allowance, a pill strip lit for what's left, the categories nearest their limit, the monthly budget), then Upcoming and Where it went (a ring). Recent transactions close the main column.

FORM: The user-pinned reference layout (pinned, outranks the roll; seed key 1c384f5f was dealt before the pin arrived and is set aside).

Signature interaction: hovering (or arrowing through) the month chart reads out that day: spent so far, where an even pace would be, and last month at the same day. Cards lift and reorder by their grip, which shows on hover on pointer devices.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
