# Ledger.m roadmap

Working list from the Rocket Money gap audit. Updated as each step lands.
Status: `[ ]` todo · `[~]` in progress · `[x]` done

## Step 1: Accuracy fixes  (branch `step1/accuracy-fixes`, PR open)
- [x] Paginate every full-table transactions read (Supabase caps a query at 1,000 rows)
- [x] Give every spending category its own chart color (5 shared the "Other" color)
- [x] Compute "this month" in America/New_York, not the server's UTC clock
- [x] Exclude hidden accounts from net worth
- [x] Add a test runner and tests for the pure money/date logic
- [x] Verify: lint clean, tsc clean, 28 tests pass, build compiles (only fails on missing local secrets)

## Later steps (in order)
## Step 2: Transaction editing  (branch `step2/transaction-editing`, PR stacked on step 1)
- [x] Recategorize, rename, notes per transaction; "apply to all matching" merchant rules; reset
- [x] Migration `0007_transaction_edits.sql` (**must be applied: `supabase db push`**)
- [x] Edits flow into every page (overview, spending, transactions, CSV)
- [x] 11 new tests (39 total)
- [ ] Not done: editing manual transactions' rules (they already have their own edit dialog); a pending charge that posts gets a new Plaid id and loses its per-transaction edit (rules still apply)

## Step 3: Budgets  (branch `step3/budgets`)
- [x] Per-category monthly budgets: progress bars, left/over, month-end pace warning, spending without a budget, suggested amount from the last 3 months
- [x] New /budgets page, sidebar link, budgets card on the overview
- [x] Migration `0008_budgets.sql` (**must be applied: `supabase db push`**)
- [x] Shared `loadSpendingData` loader for the new pages (14 new tests, 53 total)
- [ ] Over-budget push alerts come in step 4 with the other alerts
- [ ] Cleanup later: move overview/spending onto `loadSpendingData` (three pages still load the same data separately)

## Step 4: Alerts  (branch `step4/alerts`)
- [x] Push alerts (ntfy) for: category over budget / 80% used, subscription renewing in 3 days, price increase, low balance (under $100), large charge (a debit of $250+ is labeled on its normal push and never folded into a batch summary)
- [x] Each alert is recorded first (unique key), so it is sent once per situation: per category per month, per billing cycle, per new charge amount, per week for low balance. A failed push is retried next run
- [x] More than 5 alerts in one run (first run, long gap): 5 pushes + one summary, the rest visible in the app
- [x] Recent alerts card on the overview; daily cron `/api/alerts/check` plus a check after every item sync
- [x] Migration `0009_alert_events.sql` (**must be applied: `supabase db push`**); thresholds in `src/lib/config.ts`
- [x] 18 new tests (71 total), including the dispatcher against a fake database
- [ ] Not built: "unusual charge" (a charge far above that merchant's norm) beyond the $250 large-charge label; per-alert on/off settings

## Step 5: Trends  (branch `step5/trends`, no migration)
- [x] Pace card: this month vs last month day by day, compared at the same day of the month, plus last month's total and a typical-month figure
- [x] Biggest changes vs last month by category (dollars, bars, new-this-month), click one to drill into its transactions
- [x] Respects the account/search/month filters already on the Spending page
- [x] 9 new tests (pure trend math)
- [ ] Not built: income-vs-spending trend on this page (it only receives spending transactions); year-over-year

## Step 6: Cash flow / safe to spend  (branch `step6/cash-flow`, no migration)
- [x] "Safe to spend until your next paycheck" = checking cash minus the bills due before it; per-day figure; warnings when bills exceed cash, when your usual spending would overshoot, and when the balance is projected under $100
- [x] /cash-flow page: 30-day balance chart (bills/paychecks only, plus a dashed line with typical spending), upcoming bills and paychecks list, and a plain-language "how this is worked out"
- [x] Safe to spend card on the overview (loads independently, so it never slows the rest)
- [x] 15 new tests (forecast engine), 69 total
- [x] Uses the shared `ALERT_THRESHOLDS.lowBalance` (one $100 setting for alerts and the forecast)
- [ ] Not built: choosing which accounts count; credit card balances are shown but not deducted

## Step 7: Credit utilization  (branch `step7/credit-utilization`, no migration)
- [x] Utilization per card and overall (total owed / total limits), bands at 10% / 30% / 50%, "pay $X to get under 30%", cards with no reported limit left out and named
- [x] Card on the Accounts page, plus "N% of $limit limit" on each credit account row
- [x] 8 new tests (61 total on this branch)
- [ ] Not built: statement-balance-based utilization (needs data Plaid's balance endpoint doesn't give us here); a high-utilization alert

## Step 8: Subscription extras  (branch `step8/subscription-extras`, no migration)
- [x] Next date for charges Plaid gave no prediction for (your annual membership fee): one period after the last charge. Used on the Subscriptions page, overview Upcoming, alerts and the cash-flow forecast
- [x] "Worth a look" card: the same service listed twice (e.g. bank-detected plus a manual entry, which double counts it), and 2+ subscriptions of the same kind (video streaming, music, gaming, gym)
- [x] Renewal calendar: month grid for the next ~3 months with per-month renewal count and total
- [x] "New" badge (first seen in the last 45 days); trial-like start (a $1-or-less first charge that grew to $5+)
- [x] "How to cancel" link on each active subscription (a web search, not a guessed URL)
- [x] 16 new tests (119 total)
- [ ] Not built: per-service direct cancel links (would need a maintained, verified list); trial-ending warnings before conversion (Plaid only shows the conversion after it happens)

## Step 9: Savings goals  (branch `step9/savings-goals`)
- [x] /goals page: progress bar, saved of target, "set aside $X a month for N months", reached / behind states, edit, delete, add money (or take money out)
- [x] Track by hand or follow a connected account's balance
- [x] Migration `0010_savings_goals.sql` (**must be applied: `supabase db push`**)
- [x] 10 new tests (129 total)
- [ ] Not built: contribution history, auto-suggested goals, goal progress on the overview (comes with step 10)

## Step 10: Overview redesign  (branch `step10/overview-redesign`, no migration)
- [x] Net worth hero: bigger figure, change over the last 30 days ($ and %), and a 90-day sparkline (from the daily snapshots; the change appears after a week of history)
- [x] "Needs your attention" leads the page when there is something: over/near budget, subscriptions renewing within 3 days. Hidden when all is well
- [x] Spending pace card (this month vs last month at the same day, as bars) beside Safe to spend; Goals card beside Budgets; Upcoming beside Recent alerts
- [x] Goals loading shared between /goals and the overview (`loadGoals`)
- [x] 10 new tests (139 total)
- [ ] Not built: a bills timeline (the Upcoming list and the Subscriptions calendar cover it); mobile-specific tuning beyond stacking to one column

## All ten steps are built
Open follow-ups worth doing next: run the app against real data and fix what looks off; overview/spending/transactions still each load transactions separately (move them onto `loadSpendingData`); unusual-charge alerts; per-alert settings.


## Open items
- PR #1 (subscription next-date rollover) is merged; its date helpers now default to Eastern "today" (done in step 1).
- Not verified against live data: the transaction-count/1,000-row cap, and how the 5 new chart colors look next to the originals.
- Confirm real transaction count vs the 1,000-row cap (`select count(*) from transactions`).

## Polish pass (branch `polish/audit`)
- [x] Phone navigation: the sidebar was always visible, taking 224px of a phone screen. Phones now get a top bar with a menu drawer; the desktop sidebar is sticky
- [x] Content capped at a readable width (max-w-7xl, centered) instead of stretching across a wide monitor
- [x] Red text (money out, over budget, errors) was 3.3:1 contrast, below the 4.5:1 small text needs; text now uses a lighter tone of the same hue (5.5:1), fills unchanged
- [x] Visible keyboard focus on links and buttons; `aria-current` on the active nav link
- [x] Each page has its own tab title ("Budgets · Ledger.m")
- [x] Loading skeleton for the overview and accounts, which showed nothing while loading
- [x] From real screenshots: the overview's income card reported less spending ($1,517) than the spending card beside it ($2,306), because it skipped payments to unconnected cards
- [x] From real screenshots: Cash flow named the paycheck by its raw bank descriptor ("UNITED MORTGAGE PAYROLL 925644358895XMS 091526"); recurring bills and paychecks now get cleaned names everywhere (forecast, alerts, subscriptions, overview)
- [x] Bank names in capitals ("FIFTH THIRD MOMENTUM CHECKING", "Chase CREDIT CARD") are title-cased on Accounts, Assets, filters and credit utilization
- [x] "Needs your attention" collapses a pile of over-budget rows into one line that names the worst three, instead of a wall of five
- [x] Filters and their action buttons (Export, Add) wrap as one group instead of stranding a dropdown on a second line
- [x] Donut legend text is neutral (it was tinted per series, hard to read); pace chart fills its card; month names drop a repeated year
- [x] Top merchants get proportional bars; over-budget bars show how far over (soft red up to the budget, full red beyond); renewal calendar sits below the list; doubled card padding removed
- [ ] Still needs a look on a phone: menu drawer and each page at narrow width

## Phone pass (branch `mobile/phone-pass`)
- [x] Touch screens: 40px minimum for buttons and fields (desktop sizes are 28-32px) and 16px field text so iOS Safari doesn't zoom the page on focus
- [x] Transactions: Account and Category fold under the merchant name instead of forcing a sideways-scrolling table
- [x] Subscriptions: each row stacks (name, then amount and controls) instead of squeezing five things in a line; the calendar shows dots on phones, names from tablet width
- [x] Filters: search full width, dropdowns share rows; dialogs never exceed the screen height; long names truncate instead of pushing amounts off screen (overview, assets, goals, budgets, accounts)
- [x] Browser bar takes the app's dark color; nothing can make the whole page scroll sideways
- [ ] Needs a real phone to confirm: how each page reads at ~390px, chart legibility, dialogs with the keyboard open
