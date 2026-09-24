// Pure. Changing a cash balance by an amount ("I spent $40", "I got $200
// back") instead of retyping the total.

export type CashDirection = "add" | "subtract";

/** The balance after the change, or why it can't be made. */
export function adjustedCash(
  current: number,
  direction: CashDirection,
  amount: number
): { value: number } | { error: string } {
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above $0" };
  const cents = Math.round(amount * 100);
  const next = Math.round(current * 100) + (direction === "add" ? cents : -cents);
  if (next < 0) return { error: "That's more cash than you have" };
  return { value: next / 100 };
}
