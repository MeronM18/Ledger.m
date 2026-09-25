import "server-only";
import { purchaseDate } from "@/lib/transaction-dates";
import { cache } from "react";
import type { ManualTransaction } from "@/components/manual-transaction-form";
import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  filterSpendingTransactions,
  manualTransactionToSpendingTransaction,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { applyEditsToAll, type EditMeta, type MerchantRule } from "@/lib/transaction-edits";
import { loadConnectedCardIssuers, loadManualAccounts, type ManualAccount } from "@/lib/manual-accounts";
import { loadTransactionEdits, UNDEFINED_COLUMN } from "@/lib/transaction-edits-server";
import { accountName } from "@/lib/account-settings";
import { cardProgramFor, programForAccount, rewardsFor, type ProgramId, type Reward } from "@/lib/card-rewards";
import type { Card } from "@/lib/card-statements";
import { loadAccountSettings } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LedgerAccountRef = { id: string; name: string; mask: string | null };

/** One transaction, Plaid or manual, with the user's edits and rules applied. */
export type LedgerTransaction = SpendingTransaction &
  Partial<EditMeta> & {
    id: string;
    logo_url: string | null;
    iso_currency_code: string | null;
    account: LedgerAccountRef | null;
    isManual: boolean;
    // The stored row a manual entry came from, for its edit dialog.
    manualSource?: ManualTransaction;
    // What it earned on a rewards card, estimated (card-rewards.ts).
    reward?: Reward;
  };

export type Ledger = {
  // Every transaction, newest first.
  transactions: LedgerTransaction[];
  // The spending-only view: transfers, income and pending removed, payments
  // to cards that aren't connected carved back in.
  spending: LedgerTransaction[];
  // Connected accounts plus manual ones (Apple Card), for account filters,
  // named as the user sees them (their own name, or the card's product name).
  accounts: LedgerAccountRef[];
  // Credit cards, with what's known about their statements.
  cards: Card[];
  manualAccounts: ManualAccount[];
  connectedCardIssuers: string[];
  rules: MerchantRule[];
  // Credit cards with a known rewards program, and how much of each Freedom
  // Flex quarter's $1,500 went to its 5% categories ("<account id>|<quarter>").
  rewardCards: { accountId: string; name: string; program: ProgramId }[];
  freedomBonusSpend: Record<string, number>;
  currency: string;
  error: boolean;
};

type PlaidRow = SpendingTransaction & {
  id: string;
  logo_url: string | null;
  iso_currency_code: string | null;
  account: LedgerAccountRef | null;
};

type ManualRow = ManualTransaction & { manual_account_id: string | null; reimbursed_amount?: number | null };

function readManualTransactions(admin: AdminClient, withPaidBack: boolean) {
  return fetchAllRows<ManualRow>((from, to) =>
    withPaidBack
      ? admin
          .from("manual_transactions")
          .select("id, date, name, amount, pfc_primary, payment_method, notes, manual_account_id, reimbursed_amount")
          .order("date", { ascending: false })
          .order("id")
          .range(from, to)
      : admin
          .from("manual_transactions")
          .select("id, date, name, amount, pfc_primary, payment_method, notes, manual_account_id")
          .order("date", { ascending: false })
          .order("id")
          .range(from, to)
  );
}

/**
 * The one loader for "every transaction": Plaid (paged) and manual, with
 * edits and merchant rules applied. Every page that shows transactions or
 * totals reads it, so they can't disagree about what's in a month.
 *
 * Wrapped in React's cache(), so within one page render (the overview and
 * the Safe to spend and Goals cards inside it, say) it runs once, not once
 * per component. Outside a render (a cron or webhook) it simply runs.
 */
export const loadLedger = cache(async (admin: AdminClient): Promise<Ledger> => {
  const [txRes, manualFirstTry, accountsRes, issuersRes, manualAccountsRes, edits, accountSettings] = await Promise.all([
    fetchAllRows((from, to) =>
      admin
        .from("transactions")
        .select(
          "id, date, authorized_date, amount, pfc_primary, pfc_detailed, merchant_name, name, pending, iso_currency_code, logo_url, account:accounts(id, name, mask)"
        )
        .order("date", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    readManualTransactions(admin, true),
    admin.from("accounts").select("id, name, official_name, mask, type").order("name"),
    loadConnectedCardIssuers(admin),
    loadManualAccounts(admin),
    loadTransactionEdits(admin),
    loadAccountSettings(admin),
  ]);

  // Before migration 0015 there's no paid-back column: read without it.
  const manualRes = manualFirstTry.error?.code === UNDEFINED_COLUMN ? await readManualTransactions(admin, false) : manualFirstTry;

  if (txRes.error) console.error("Failed to load transactions", txRes.error);
  if (manualRes.error) console.error("Failed to load manual transactions", manualRes.error);
  if (accountsRes.error) console.error("Failed to load accounts", accountsRes.error);

  // A manual card account (Apple Card) is an account like a connected one;
  // plain manual entries (cash) have none.
  const manualAccountRefs = new Map(
    manualAccountsRes.accounts.map((c) => [c.id, { id: `manual:${c.id}`, name: c.name, mask: c.mask }])
  );

  // A many-to-one embed comes back as one object; the generated types say array.
  const namedAccounts = (accountsRes.data ?? []).map((a) => ({
    id: a.id as string,
    name: accountName({ name: a.name as string, official_name: a.official_name as string | null }, accountSettings[a.id as string]),
    mask: a.mask as string | null,
    type: a.type as string,
  }));
  const accountById = new Map(namedAccounts.map((a) => [a.id, a]));
  const plaidRows = ((txRes.data ?? []) as unknown as (PlaidRow & { authorized_date: string | null })[]).map((t) => {
    const { authorized_date, ...row } = t;
    // Shown and totaled on the day of the purchase, as the bank's app lists
    // it, not the day it posted; the posted day is kept for statements.
    const dated = { ...row, date: purchaseDate({ date: t.date, authorized_date }), posted_date: t.date };
    const named = t.account ? accountById.get(t.account.id) : undefined;
    return named ? { ...dated, account: { id: named.id, name: named.name, mask: named.mask } } : dated;
  });
  const plaid: LedgerTransaction[] = applyEditsToAll(plaidRows, edits.overrides, edits.rules).map((t) => ({
    ...t,
    isManual: false,
  }));
  const manual: LedgerTransaction[] = (manualRes.data ?? []).map((m) => {
    const { manual_account_id, reimbursed_amount, ...source } = m;
    return {
      ...manualTransactionToSpendingTransaction(m),
      paid_back: reimbursed_amount ? Number(reimbursed_amount) : null,
      id: m.id,
      logo_url: null,
      iso_currency_code: null,
      account: (manual_account_id && manualAccountRefs.get(manual_account_id)) || null,
      isManual: true,
      manualSource: source,
    };
  });

  // Each rewards card by account id, as chosen in its settings or known by
  // its names, and what every purchase on one earned. Rewards go by the
  // merchant as the bank reported it, whatever it's been renamed to.
  const rewardCards = [
    ...(accountsRes.data ?? [])
      .filter((a) => a.type === "credit")
      .map((a) => ({
        accountId: a.id as string,
        program: programForAccount(
          [accountSettings[a.id as string]?.nickname, a.official_name as string | null, a.name as string],
          accountSettings[a.id as string]?.rewardsProgram
        ),
      })),
    ...manualAccountsRes.accounts
      .filter((a) => a.type === "credit")
      .map((a) => ({ accountId: `manual:${a.id}`, program: cardProgramFor(`${a.name} ${a.institution_name}`) })),
  ].flatMap((c) => (c.program ? [{ accountId: c.accountId, program: c.program, name: accountById.get(c.accountId)?.name ?? manualAccountRefs.get(c.accountId.slice(7))?.name ?? "" }] : []));
  const { rewards, bonusSpend } = rewardsFor(
    [...plaid, ...manual].map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      pfc_primary: t.pfc_primary,
      pfc_detailed: t.pfc_detailed ?? null,
      merchant: `${t.original_merchant_name ?? t.merchant_name ?? ""} ${t.name ?? ""}`,
      accountId: t.account?.id ?? null,
      pending: t.pending,
    })),
    new Map(rewardCards.map((c) => [c.accountId, c.program]))
  );
  for (const t of [...plaid, ...manual]) {
    const reward = rewards.get(t.id);
    if (reward) t.reward = reward;
  }

  const transactions = [...plaid, ...manual].sort((a, b) => b.date.localeCompare(a.date));

  return {
    transactions,
    spending: filterSpendingTransactions(transactions, issuersRes.issuers) as LedgerTransaction[],
    accounts: [...namedAccounts.map(({ id, name, mask }) => ({ id, name, mask })), ...manualAccountRefs.values()],
    cards: [
      ...namedAccounts
        .filter((a) => a.type === "credit")
        .map((a) => ({
          id: a.id,
          name: `${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
          closeDay: accountSettings[a.id]?.statementCloseDay ?? null,
          dueDay: accountSettings[a.id]?.paymentDueDay ?? null,
        })),
      // Apple Card statements run from the 1st to the end of the month.
      ...manualAccountsRes.accounts
        .filter((a) => a.type === "credit")
        .map((a) => ({ id: `manual:${a.id}`, name: a.name, closeDay: null, dueDay: null, closesAtMonthEnd: true })),
    ],
    manualAccounts: manualAccountsRes.accounts,
    connectedCardIssuers: issuersRes.issuers,
    rules: edits.rules,
    rewardCards,
    freedomBonusSpend: Object.fromEntries(bonusSpend),
    currency: plaidRows[0]?.iso_currency_code ?? "USD",
    error: Boolean(
      txRes.error || manualRes.error || accountsRes.error || issuersRes.error || manualAccountsRes.error || edits.error
    ),
  };
});

/** The ledger as plain totals-ready transactions, for the budgets, forecast and alerts code. */
export async function loadSpendingData(admin: AdminClient): Promise<{
  all: SpendingTransaction[];
  spending: SpendingTransaction[];
  currency: string;
  error: boolean;
}> {
  const ledger = await loadLedger(admin);
  return { all: ledger.transactions, spending: ledger.spending, currency: ledger.currency, error: ledger.error };
}
