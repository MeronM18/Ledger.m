// The defaults for what Settings lets you change (app-preferences.ts reads
// the saved values): the name in the /overview greeting, and the alert
// thresholds.
export const DISPLAY_NAME = "Mr. Matti";

export const ALERT_THRESHOLDS = {
  // A single debit at or above this gets a "Large charge" label on its push.
  largeCharge: 250,
  // A checking/savings account below this (available balance) triggers a
  // low-balance alert, at most once a week while it stays low.
  lowBalance: 100,
  // A subscription renewing within this many days triggers a heads-up.
  renewalDaysAhead: 3,
};

// What Plaid charges for each "Sync now" (a /transactions/refresh call, per
// bank), from the contract's rate card. Automatic syncing (webhooks and the
// daily run) doesn't use it and costs nothing extra. Shown on the Sync
// buttons so a manual sync is never a surprise on the bill.
export const PLAID_REFRESH_COST = 0.12;
