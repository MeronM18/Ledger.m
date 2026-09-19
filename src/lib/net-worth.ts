// Pure, dependency-free so /assets and /overview compute net worth from the
// exact same formula instead of two hand-copied reduces that can drift.

export type NetWorthAccount = {
  type: string;
  current_balance: number | null;
};

export type NetWorthManualAsset = {
  value: number;
  is_liability: boolean;
};

// Plaid AccountType: investment, credit, depository, loan, brokerage, other.
// credit/loan balances are amounts owed (liabilities); everything else is a
// balance you hold (an asset). "other" defaults to asset — there's no
// general rule for it, and most real "other" accounts (e.g. prepaid) behave
// like an asset.
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function isLiabilityAccount(type: string): boolean {
  return LIABILITY_TYPES.has(type);
}

export function computeNetWorth(
  accounts: NetWorthAccount[],
  manualAssets: NetWorthManualAsset[]
): { totalAssets: number; totalLiabilities: number; netWorth: number } {
  const totalPlaidAssets = accounts
    .filter((a) => !isLiabilityAccount(a.type))
    .reduce((sum, a) => sum + (a.current_balance ?? 0), 0);
  const totalPlaidLiabilities = accounts
    .filter((a) => isLiabilityAccount(a.type))
    .reduce((sum, a) => sum + (a.current_balance ?? 0), 0);

  const totalManualAssets = manualAssets
    .filter((a) => !a.is_liability)
    .reduce((sum, a) => sum + a.value, 0);
  const totalManualLiabilities = manualAssets
    .filter((a) => a.is_liability)
    .reduce((sum, a) => sum + a.value, 0);

  const totalAssets = totalPlaidAssets + totalManualAssets;
  const totalLiabilities = totalPlaidLiabilities + totalManualLiabilities;

  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}
