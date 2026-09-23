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
- [ ] Step 2: Recategorize transactions, merchant renames, rules, notes
- [ ] Step 3: Budgets with progress and over-budget alerts
- [ ] Step 4: Alerts (large/unusual charge, price increase, upcoming renewal, low balance)
- [ ] Step 5: Trends (month over month, spending pace, category drill-down)
- [ ] Step 6: Cash-flow forecast / safe to spend
- [ ] Step 7: Credit utilization
- [ ] Step 8: Subscription extras (trials, duplicates, renewal calendar, annual dates)
- [ ] Step 9: Savings goals
- [ ] Step 10: Overview redesign (net worth sparkline, pace bar, bills timeline)

## Open items
- PR #1 (subscription next-date rollover) is merged; its date helpers now default to Eastern "today" (done in step 1).
- Not verified against live data: the transaction-count/1,000-row cap, and how the 5 new chart colors look next to the originals.
- Confirm real transaction count vs the 1,000-row cap (`select count(*) from transactions`).
