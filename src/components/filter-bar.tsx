"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type AccountOption = { id: string; name: string; mask: string | null };
export type CategoryOption = { value: string; label: string };

export const DATE_RANGES = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All" },
] as const;

export type DateRangeKey = (typeof DATE_RANGES)[number]["key"];

export function accountLabel(account: AccountOption | null): string {
  if (!account) return "Unknown account";
  return account.mask ? `${account.name} ••${account.mask}` : account.name;
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
  dateRangeValue,
  onDateRangeChange,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  accounts?: AccountOption[];
  accountValue?: string;
  onAccountChange?: (value: string) => void;
  categories?: CategoryOption[];
  categoryValue?: string;
  onCategoryChange?: (value: string) => void;
  dateRangeValue?: DateRangeKey;
  onDateRangeChange?: (value: DateRangeKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onSearchChange && (
        <Input
          placeholder="Search merchant or description..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-xs"
        />
      )}

      {accounts && onAccountChange && (
        <Select value={accountValue} onValueChange={onAccountChange}>
          <SelectTrigger className="w-48">
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
          <SelectTrigger className="w-44">
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

      {onDateRangeChange && (
        <div className="flex gap-1">
          {DATE_RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={dateRangeValue === r.key ? "secondary" : "ghost"}
              onClick={() => onDateRangeChange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
