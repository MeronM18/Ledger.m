// Pure, dependency-free. Layers user edits (per-transaction overrides and
// merchant rules) over a Plaid transaction WITHOUT mutating stored data:
// everything downstream (effectiveCategory, humanizeTransactionName, all the
// aggregations) already reads pfc_primary / merchant_name / category_override
// off the row, so applying edits once at load time is the single place this
// happens and every page agrees.

export type TransactionOverride = {
  transaction_id: string;
  category: string | null;
  merchant_name: string | null;
  notes: string | null;
};

export type MerchantRule = {
  id: string;
  match_text: string;
  rename_to: string | null;
  category: string | null;
};

type Editable = {
  id?: string;
  name: string | null;
  merchant_name: string | null;
};

export type EditMeta = {
  category_override: string | null;
  notes: string | null;
  // True when an override row exists or a rule matched.
  edited: boolean;
  // The merchant/raw name before any rename, kept so the edit dialog can
  // show what Plaid sent and so a rule can be seeded from it.
  original_merchant_name: string | null;
};

/**
 * The rule that applies to a transaction, or null. Case-insensitive
 * substring match against merchant name + raw name; when several match, the
 * longest match text wins (the most specific rule), ties broken by list
 * order.
 */
export function findMatchingRule<T extends Editable>(tx: T, rules: MerchantRule[]): MerchantRule | null {
  const haystack = `${tx.merchant_name ?? ""} ${tx.name ?? ""}`.toLowerCase();
  let best: MerchantRule | null = null;

  for (const rule of rules) {
    const needle = rule.match_text.trim().toLowerCase();
    if (needle.length < 2 || !haystack.includes(needle)) continue;
    if (!best || needle.length > best.match_text.trim().length) best = rule;
  }

  return best;
}

/**
 * Per field, precedence is: this transaction's own override > the matching
 * rule > what Plaid sent. Blank strings count as "no edit".
 */
export function applyTransactionEdits<T extends Editable>(
  tx: T,
  override: TransactionOverride | undefined,
  rules: MerchantRule[]
): T & EditMeta {
  const rule = findMatchingRule(tx, rules);

  const renamed = override?.merchant_name?.trim() || rule?.rename_to?.trim() || null;
  const category = override?.category || rule?.category || null;

  return {
    ...tx,
    merchant_name: renamed ?? tx.merchant_name,
    category_override: category,
    notes: override?.notes?.trim() || null,
    edited: Boolean(override || rule),
    original_merchant_name: tx.merchant_name,
  };
}

export function applyEditsToAll<T extends Editable & { id: string }>(
  rows: T[],
  overrides: Map<string, TransactionOverride>,
  rules: MerchantRule[]
): (T & EditMeta)[] {
  return rows.map((row) => applyTransactionEdits(row, overrides.get(row.id), rules));
}
