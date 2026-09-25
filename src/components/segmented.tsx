"use client";

import { cn } from "@/lib/utils";

/** A pair (or more) of buttons where one is on, like a small segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.title}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 whitespace-nowrap transition-colors",
            value === o.value ? "bg-bone/12 text-bone ring-1 ring-bone/10 ring-inset hover:bg-bone/16" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
