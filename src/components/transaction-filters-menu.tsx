"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  activeFilterCount,
  DEFAULT_LIST_OPTIONS,
  SORT_LABELS,
  type ListOptions,
  type ListSort,
} from "@/lib/transaction-list";
import { cn } from "@/lib/utils";

/** A row of mutually exclusive choices, like a small segmented control. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 rounded-md border border-border p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[5px] px-2 py-1 text-xs transition-colors",
              value === o.value ? "bg-bone/10 text-bone" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const amountValue = (n: number | null) => (n === null ? "" : String(n));
const parseAmount = (s: string) => {
  const n = Number(s);
  return s.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
};

type Picker = { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void };

/** One of the Account or Category pickers at the top of the menu; "all" is the no-filter choice. */
function PickerField({ id, label, allLabel, pick }: { id: string; label: string; allLabel: string; pick: Picker }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Select value={pick.value} onValueChange={pick.onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="all">{allLabel}</SelectItem>
          {pick.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Sorting and every filter for the transactions list but search and date, behind one button. */
export function TransactionFiltersMenu({
  options,
  onChange,
  account,
  category,
}: {
  options: ListOptions;
  onChange: (options: ListOptions) => void;
  account?: Picker;
  category?: Picker;
}) {
  const set = <K extends keyof ListOptions>(key: K, value: ListOptions[K]) => onChange({ ...options, [key]: value });
  const count = activeFilterCount(options) + Number(Boolean(account && account.value !== "all")) + Number(Boolean(category && category.value !== "all"));
  const changed = count > 0 || options.sort !== DEFAULT_LIST_OPTIONS.sort;

  function reset() {
    onChange(DEFAULT_LIST_OPTIONS);
    account?.onChange("all");
    category?.onChange("all");
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label={count > 0 ? `Filters (${count} on)` : "Filters"}>
          <SlidersHorizontal className="size-3.5" />
          Filters
          {count > 0 && (
            <span className="ml-0.5 rounded-full bg-champagne px-1.5 font-mono text-[10px] leading-4 text-onyx tabular-nums">{count}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[min(40rem,calc(100dvh-8rem))] flex-col gap-4 overflow-y-auto">
        {account && <PickerField id="list-account" label="Account" allLabel="All accounts" pick={account} />}
        {category && <PickerField id="list-category" label="Category" allLabel="All categories" pick={category} />}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="list-sort" className="text-xs font-normal text-muted-foreground">
            Sort by
          </Label>
          <Select value={options.sort} onValueChange={(v) => set("sort", v as ListSort)}>
            <SelectTrigger id="list-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {(Object.keys(SORT_LABELS) as ListSort[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Choice
          label="Show"
          value={options.direction}
          onChange={(v) => set("direction", v)}
          options={[
            { value: "all", label: "All" },
            { value: "out", label: "Money out" },
            { value: "in", label: "Money in" },
          ]}
        />

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Amount</p>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Minimum amount"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              className="no-spinner"
              placeholder="Min $"
              value={amountValue(options.minAmount)}
              onChange={(e) => set("minAmount", parseAmount(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              aria-label="Maximum amount"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              className="no-spinner"
              placeholder="Max $"
              value={amountValue(options.maxAmount)}
              onChange={(e) => set("maxAmount", parseAmount(e.target.value))}
            />
          </div>
        </div>

        <Choice
          label="Status"
          value={options.status}
          onChange={(v) => set("status", v)}
          options={[
            { value: "all", label: "All" },
            { value: "posted", label: "Posted" },
            { value: "pending", label: "Pending" },
          ]}
        />

        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex flex-col">
              Hide transfers &amp; card payments
              <span className="text-xs text-muted-foreground">Money moving between your own accounts</span>
            </span>
            <Switch checked={options.hideTransfers} onCheckedChange={(v) => set("hideTransfers", v)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Only with notes
            <Switch checked={options.onlyWithNotes} onCheckedChange={(v) => set("onlyWithNotes", v)} />
          </label>
        </div>

        <Button size="sm" variant="ghost" className="self-end" disabled={!changed} onClick={reset}>
          Reset
        </Button>
      </PopoverContent>
    </Popover>
  );
}
