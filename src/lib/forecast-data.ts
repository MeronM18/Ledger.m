import "server-only";
import { ALERT_THRESHOLDS } from "@/lib/config";
import { accountName } from "@/lib/account-settings";
import { buildForecast, nextDueDate, typicalDailySpend, type CardPayment, type Forecast, type RecurringItem } from "@/lib/forecast";
import { loadSpendingData } from "@/lib/spending-data";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { effectiveNextDate } from "@/lib/subscription-insights";
import { streamDisplayName } from "@/lib/transaction-display";
import type { createAdminClient } from "@/lib/supabase/admin";
import { loadAccountSettings } from "@/lib/ui-preferences";
import { calendarNow, easternToday } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

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
  const [spending, accountsRes, streamsRes, manualRes, manualCardsRes, accountSettings] = await Promise.all([
    loadSpendingData(admin),
    admin
      .from("accounts")
      .select("id, name, official_name, mask, type, subtype, available_balance, current_balance")
      .eq("is_hidden", false),
    admin
      .from("recurring_streams")
      .select("id, direction, merchant_name, description, average_amount, last_amount, frequency, predicted_next_date, last_date, pfc_detailed")
      .eq("is_active", true)
      .eq("user_marked_cancelled", false)
      .eq("direction", "outflow"),
    admin.from("manual_subscriptions").select("id, name, amount, frequency, next_billing_date").eq("is_active", true),
    loadManualAccounts(admin),
    loadAccountSettings(admin),
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
  // What's owed on each card, paid in full on its due date: the due day set
  // on Accounts for a connected card; Apple Card at the end of the month.
  const todayIso = calendarNow().isoDate;
  const cardPayments: CardPayment[] = [
    ...accounts
      .filter((a) => a.type === "credit")
      .map((a) => {
        const settings = accountSettings[a.id as string];
        const name = accountName({ name: a.name as string, official_name: a.official_name as string | null }, settings);
        return {
          name: a.mask ? `${name} ••${a.mask}` : name,
          amount: Math.max(0, Number(a.current_balance ?? 0)),
          date: settings?.paymentDueDay ? nextDueDate(todayIso, settings.paymentDueDay) : null,
        };
      }),
    ...manualCardsRes.accounts
      .filter((c) => c.type === "credit")
      .map((c) => ({ name: c.name, amount: Math.max(0, c.balance), date: nextDueDate(todayIso, 31) })),
  ];
  const creditOwed = cardPayments.reduce((sum, c) => sum + c.amount, 0);

  // Card payments the bank detected as a recurring bill are left out: the
  // balances above already cover them, and counting both would double it.
  const streams = (streamsRes.data ?? []).filter((s) => s.pfc_detailed !== "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
  const bills: RecurringItem[] = [
    ...streams.map((s) => ({
      id: s.id as string,
      name: streamDisplayName(s, "outflow", "Recurring bill"),
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

  const forecast = buildForecast({
    cash,
    today: easternToday(),
    bills,
    // Income is commission-based, so the amount and date of the next check
    // can't be predicted from past deposits. Plaid's detected inflow streams
    // would put a made-up paycheck in the forecast, so none are counted:
    // money only counts once it has landed in the balance.
    income: [],
    typicalDailySpend: typicalDailySpend(spending.spending, calendarNow().isoDate, bills),
    lowBalanceThreshold: ALERT_THRESHOLDS.lowBalance,
    cardPayments,
  });

  return {
    error: false,
    forecast,
    currency: spending.currency,
    creditOwed,
    hasCashAccount: cashAccounts.length > 0,
  };
}
