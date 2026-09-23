import "server-only";
import { ALERT_THRESHOLDS } from "@/lib/config";
import { buildForecast, typicalDailySpend, type Forecast, type RecurringItem } from "@/lib/forecast";
import { loadSpendingData } from "@/lib/spending-data";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { effectiveNextDate } from "@/lib/subscription-insights";
import { streamDisplayName } from "@/lib/transaction-display";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow, easternToday } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

// Inflow streams under this are more likely a small transfer than a
// paycheck; counting on them would make "next payday" flicker.
const MIN_PAYCHECK_AMOUNT = 100;

export type ForecastData =
  | { error: true }
  | {
      error: false;
      forecast: Forecast;
      currency: string;
      creditOwed: number;
      hasCashAccount: boolean;
    };

function amountOf(...values: (number | string | null)[]): number {
  for (const v of values) {
    if (v !== null && v !== undefined && Number(v) !== 0) return Math.abs(Number(v));
  }
  return 0;
}

export async function loadForecast(admin: AdminClient): Promise<ForecastData> {
  const [spending, accountsRes, streamsRes, manualRes, manualCardsRes] = await Promise.all([
    loadSpendingData(admin),
    admin.from("accounts").select("type, subtype, available_balance, current_balance").eq("is_hidden", false),
    admin
      .from("recurring_streams")
      .select("id, direction, merchant_name, description, average_amount, last_amount, frequency, predicted_next_date, last_date")
      .eq("is_active", true)
      .eq("user_marked_cancelled", false),
    admin.from("manual_subscriptions").select("id, name, amount, frequency, next_billing_date").eq("is_active", true),
    loadManualAccounts(admin),
  ]);

  if (accountsRes.error) console.error("Failed to load accounts for forecast", accountsRes.error);
  if (streamsRes.error) console.error("Failed to load recurring streams for forecast", streamsRes.error);
  if (manualRes.error) console.error("Failed to load manual subscriptions for forecast", manualRes.error);
  if (spending.error || accountsRes.error || streamsRes.error || manualRes.error || manualCardsRes.error) return { error: true };

  const accounts = accountsRes.data ?? [];
  // Day-to-day cash: checking-type accounts. Savings is usually set aside, so
  // counting it would overstate what's safe to spend. If there's no
  // checking-type account at all, fall back to every depository account
  // rather than showing $0.
  const SPENDABLE_SUBTYPES = new Set(["checking", "cash management", "prepaid", "paypal"]);
  const depository = accounts.filter((a) => a.type === "depository");
  const checkingLike = depository.filter((a) => SPENDABLE_SUBTYPES.has((a.subtype ?? "").toLowerCase()));
  const cashAccounts = checkingLike.length > 0 ? checkingLike : depository;
  const cash = cashAccounts.reduce((sum, a) => sum + Number(a.available_balance ?? a.current_balance ?? 0), 0);
  const creditOwed =
    accounts.filter((a) => a.type === "credit").reduce((sum, a) => sum + Number(a.current_balance ?? 0), 0) +
    manualCardsRes.accounts.reduce((sum, c) => sum + Math.max(0, c.balance), 0);

  const streams = streamsRes.data ?? [];
  const streamName = (
    s: { merchant_name: string | null; description: string | null },
    fallback: string,
    direction: "inflow" | "outflow"
  ) => streamDisplayName(s, direction, fallback);

  const bills: RecurringItem[] = [
    ...streams
      .filter((s) => s.direction === "outflow")
      .map((s) => ({
        id: s.id as string,
        name: streamName(s, "Recurring bill", "outflow"),
        amount: amountOf(s.average_amount, s.last_amount),
        frequency: s.frequency as string | null,
        date: effectiveNextDate(s.predicted_next_date as string | null, s.last_date as string | null, s.frequency as string | null),
      })),
    ...(manualRes.data ?? []).map((m) => ({
      id: m.id as string,
      name: m.name as string,
      amount: Math.abs(Number(m.amount)),
      frequency: m.frequency as string,
      date: m.next_billing_date as string | null,
    })),
  ].filter((b) => b.amount > 0);

  const income: RecurringItem[] = streams
    .filter((s) => s.direction === "inflow")
    .map((s) => ({
      id: s.id as string,
      name: streamName(s, "Income", "inflow"),
      // Plaid signs inflows as negative amounts; only the size matters here.
      amount: amountOf(s.average_amount, s.last_amount),
      frequency: s.frequency as string | null,
      date: effectiveNextDate(s.predicted_next_date as string | null, s.last_date as string | null, s.frequency as string | null),
    }))
    .filter((i) => i.amount >= MIN_PAYCHECK_AMOUNT);

  const forecast = buildForecast({
    cash,
    today: easternToday(),
    bills,
    income,
    typicalDailySpend: typicalDailySpend(spending.spending, calendarNow().isoDate, bills),
    lowBalanceThreshold: ALERT_THRESHOLDS.lowBalance,
  });

  return {
    error: false,
    forecast,
    currency: spending.currency,
    creditOwed,
    hasCashAccount: cashAccounts.length > 0,
  };
}
