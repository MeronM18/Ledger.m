// The sidebar's collapsed state is remembered in this cookie, so the server
// renders it the way it was left instead of it snapping shut after the page
// loads. Its own module, not the sidebar's: the server layout reads it, and a
// value exported from a "use client" file isn't a plain value on the server.
export const SIDEBAR_COOKIE = "ledger_sidebar";

// Set once the welcome animation has played this browser session, so the
// layout doesn't draw it again on a refresh.
export const WELCOME_COOKIE = "ledger_welcomed";
