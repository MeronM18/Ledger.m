// Pure. Which day a transaction happened on.
//
// Plaid gives a transaction two dates: `authorized_date`, the day the
// purchase was made (what a bank's own app lists it under), and `date`, the
// day it posted, often a day or two later. Everything shown and totaled goes
// by the day of the purchase; only statement periods (which banks draw by
// posting date) go by the posting date. Deposits and some pending rows have
// no authorized date; they use the posted one.

export function purchaseDate(t: { date: string; authorized_date?: string | null }): string {
  return t.authorized_date || t.date;
}

/** The day a transaction posted to the account, for statement periods. */
export function postedDate(t: { date: string; posted_date?: string | null }): string {
  return t.posted_date || t.date;
}
