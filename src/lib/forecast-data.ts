import "server-only";
import { cache } from "react";
import { accountName } from "@/lib/account-settings";
import { buildForecast, nextDueDate, typicalDailySpend, type CardPayment, type Forecast, type RecurringItem } from "@/lib/forecast";
import { loadSpendingData } from "@/lib/spending-data";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { loadSubscriptions } from "@/lib/recurring-extras";
import type { createAdminClient } from "@/lib/supabase/admin";
import { loadAccountSettings, loadAlertThresholds } from "@/lib/ui-preferences";
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
      // The low-balance line the forecast is checked against, from Settings.
      lowBalanceThreshold: number;
    };

export const loadForecast = cache(async function loadForecast(admin: AdminClient): Promise<ForecastData> {
  const [spending, accountsRes, subscriptions, manualCardsRes, accountSettings, thresholds] = await Promise.all([
    loadSpendingData(admin),
    admin
      .from("accounts")
      .select("id, name, official_name, mask, type, subtype, available_balance, current_balance")
      .eq("is_hidden", false),
    // Every subscription that's going, each counted once (the bank's, found in your charges, or yours).
    loadSubscriptions(admin),
    loadManualAccounts(admin),
    loadAccountSettings(admin),
    loadAlertThresholds(admin),
  ]);

  if (accountsRes.error) console.error("Failed to load accounts for forecast", accountsRes.error);
  if (spending.error || accountsRes.error || subscriptions.error || manualCardsRes.error) return { error: true };

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

  // Card payments the bank detected as a recurring bill are left out of the
  // list: the balances above already cover them, and counting both would double it.
  const bills: RecurringItem[] = subscriptions.tracked.map((t) => ({ id: t.key, name: t.name, amount: t.amount, frequency: t.frequency, date: t.date }));

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
    lowBalanceThreshold: thresholds.lowBalance,
    cardPayments,
  });

  return {
    error: false,
    forecast,
    currency: spending.currency,
    creditOwed,
    hasCashAccount: cashAccounts.length > 0,
    lowBalanceThreshold: thresholds.lowBalance,
  };
});
