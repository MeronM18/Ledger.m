// Pure. When a pending charge posts, Plaid sends the posted transaction as
// new (with its own id, naming the pending one it replaces) and removes the
// pending one. An edit made while it was pending (a new name or category,
// notes, an amount paid back) belongs to the posted transaction now; this
// works out which edits move where, so the sync can copy them across before
// the pending row (and its edit) is deleted.

export type OverrideRow = { transaction_id: string } & Record<string, unknown>;

// Bookkeeping columns that belong to the row, not the edit.
const NOT_COPIED = new Set(["transaction_id", "created_at", "updated_at"]);

export function planEditCarryOver(
  // Posted transaction's Plaid id -> the pending one it replaced.
  settled: { posted: string; pending: string }[],
  // Plaid transaction id -> the internal transactions.id.
  internalIdOf: Map<string, string>,
  // Edits on the pending transactions, by internal id.
  pendingOverrides: Map<string, OverrideRow>
): OverrideRow[] {
  return settled.flatMap(({ posted, pending }) => {
    const pendingId = internalIdOf.get(pending);
    const postedId = internalIdOf.get(posted);
    const edit = pendingId ? pendingOverrides.get(pendingId) : undefined;
    if (!edit || !postedId) return [];
    const copy: OverrideRow = { transaction_id: postedId };
    for (const [key, value] of Object.entries(edit)) if (!NOT_COPIED.has(key)) copy[key] = value;
    return [copy];
  });
}
