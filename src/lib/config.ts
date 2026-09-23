// Single-user app — a plain constant rather than a full user-profile/
// settings system. Change this to change the name shown in the /overview
// greeting; nothing else reads it.
export const DISPLAY_NAME = "Mr. Matti";

// Alert thresholds. Constants for the same reason as DISPLAY_NAME: one
// user, so a settings screen would be more machinery than the values need.
export const ALERT_THRESHOLDS = {
  // A single debit at or above this gets a "Large charge" label on its push.
  largeCharge: 250,
  // A checking/savings account below this (available balance) triggers a
  // low-balance alert, at most once a week while it stays low.
  lowBalance: 100,
  // A subscription renewing within this many days triggers a heads-up.
  renewalDaysAhead: 3,
};
