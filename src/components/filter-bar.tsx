"use client";

import { Input } from "@/components/ui/input";
import { prettyName } from "@/lib/transaction-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AccountOption = { id: string; name: string; mask: string | null };
export type CategoryOption = { value: string; label: string };

// Manually-entered transactions/subscriptions aren't tied to any connected
// Plaid account. Rather than let them silently disappear whenever a
// specific account filter is applied (or only surface via "All accounts"),
// pages that mix the two sources add this as a real, explicit filter
// option — same sentinel value everywhere it's used, so the filtering
// predicate in each explorer checks against one shared identifier.
export const MANUAL_ACCOUNT_ID = "__manual__";
export const MANUAL_ACCOUNT_OPTION: AccountOption = {
  id: MANUAL_ACCOUNT_ID,
  name: "Cash / Manual",
  mask: null,
};
// value is "YYYY-MM"; the "all" sentinel is added by FilterBar itself, same
// as the "All accounts"/"All categories" entries below.
export type MonthOption = { value: string; label: string };

export function accountLabel(account: AccountOption | null): string {
  if (!account) return "Unknown account";
  const name = prettyName(account.name);
  return account.mask ? `${name} ••${account.mask}` : name;
}

/**
 * The one filter control bar used everywhere filters appear (/transactions,
 * /spending, /subscriptions). Each control is opt-in via its value/onChange
 * pair — a page passes only the pieces it needs instead of this component
 * branching on a page identity, so a page with no use for e.g. date range
 * simply never mounts it.
 */
export function FilterBar({
  search,
  onSearchChange,
  accounts,
  accountValue,
  onAccountChange,
  categories,
  categoryValue,
  onCategoryChange,
  months,
  monthValue,
  onMonthChange,
  actions,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  accounts?: AccountOption[];
  accountValue?: string;
  onAccountChange?: (value: string) => void;
  categories?: CategoryOption[];
  categoryValue?: string;
  onCategoryChange?: (value: string) => void;
  months?: MonthOption[];
  monthValue?: string;
  onMonthChange?: (value: string) => void;
  // Buttons pinned to the end of the same row (Export, Add ...), so the
  // filters and actions wrap as one group instead of stranding a control.
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onSearchChange && (
        <Input
          placeholder="Search merchant or description..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full sm:max-w-xs sm:flex-1"
        />
      )}

      {accounts && onAccountChange && (
        <Select value={accountValue} onValueChange={onAccountChange}>
          <SelectTrigger className="min-w-36 flex-1 sm:w-48 sm:flex-none">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {accountLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {categories && onCategoryChange && (
        <Select value={categoryValue} onValueChange={onCategoryChange}>
          <SelectTrigger className="min-w-36 flex-1 sm:w-44 sm:flex-none">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {months && onMonthChange && (
        <Select value={monthValue} onValueChange={onMonthChange}>
          <SelectTrigger className="min-w-36 flex-1 sm:w-44 sm:flex-none">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
