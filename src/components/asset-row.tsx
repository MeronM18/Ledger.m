import { cn } from "@/lib/utils";

/**
 * One row of "Assets you track yourself", laid out like the account rows
 * above it on Accounts: its mark, name and details, its buttons (shown on
 * hover where there is one), and its value in the same right-hand column.
 */
export function AssetRow({
  mark,
  name,
  detail,
  value,
  note,
  actions,
}: {
  mark: React.ReactNode;
  name: React.ReactNode;
  detail: React.ReactNode;
  value: React.ReactNode;
  // A line under the value: when it was updated, or priced.
  note?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <li className="group/row grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-border px-3 py-3 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_8.5rem] sm:gap-3 sm:px-4">
      {mark}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="flex items-center justify-end [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100">
        {actions}
      </div>
      <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
        {value}
        {note && <span className="truncate text-[11px] text-muted-foreground">{note}</span>}
      </div>
    </li>
  );
}

/** A section's heading bar: its name and total, and its buttons at the right. */
export function AssetSectionHeader({
  title,
  total,
  children,
  className,
}: {
  title: string;
  total?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 border-y border-border bg-muted/40 px-3 py-2 sm:px-4", className)}>
      <p className="flex items-baseline gap-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {title}
        {total !== undefined && <span className="font-mono text-xs tracking-normal text-bone normal-case tabular-nums">{total}</span>}
      </p>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}
