"use client";

import { useState } from "react";
import { Banknote, CreditCard, FileText, Gift, Landmark, MoreHorizontal, Send, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Stored as the label itself (payment_method is free text), so "Cash" is
// what moves the Cash asset, exactly as when it was typed.
export const PAYMENT_METHODS: { label: string; Icon: LucideIcon }[] = [
  { label: "Cash", Icon: Banknote },
  { label: "Debit card", Icon: CreditCard },
  { label: "Credit card", Icon: CreditCard },
  { label: "Check", Icon: FileText },
  { label: "Zelle", Icon: Send },
  { label: "Venmo", Icon: Smartphone },
  { label: "Cash App", Icon: Smartphone },
  { label: "PayPal", Icon: Wallet },
  { label: "Apple Cash", Icon: Smartphone },
  { label: "Bank transfer", Icon: Landmark },
  { label: "Gift card", Icon: Gift },
];

/** The listed method a saved value is, ignoring case, or null for anything else. */
export function knownMethod(value: string): string | null {
  const v = value.trim().toLowerCase();
  return PAYMENT_METHODS.find((m) => m.label.toLowerCase() === v)?.label ?? null;
}

/**
 * How a hand-added transaction was paid, picked from the usual ways instead
 * of typed: a row of chips, with "Other" for anything not listed. Picking
 * the chosen one again clears it.
 */
export function PaymentMethodPicker({ value, onChange, direction }: { value: string; onChange: (v: string) => void; direction: "out" | "in" }) {
  // "Other" stays open while its box is being typed in, even when empty.
  const [otherOpen, setOtherOpen] = useState(() => value.trim() !== "" && knownMethod(value) === null);
  const selected = otherOpen ? null : knownMethod(value);

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
      active ? "border-champagne/60 bg-champagne/12 text-champagne" : "border-border text-muted-foreground hover:border-bone/25 hover:text-bone"
    );

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-1.5">
        {PAYMENT_METHODS.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={selected === label}
            onClick={() => {
              setOtherOpen(false);
              onChange(selected === label ? "" : label);
            }}
            className={chip(selected === label)}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={otherOpen}
          onClick={() => {
            setOtherOpen(!otherOpen);
            onChange("");
          }}
          className={chip(otherOpen)}
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
          Other
        </button>
      </div>
      {otherOpen && <Input autoFocus aria-label="Other payment method" value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Money order" />}
      {selected === "Cash" && (
        <p className="text-xs text-muted-foreground">{direction === "out" ? "Comes out of your Cash on Accounts." : "Goes into your Cash on Accounts."}</p>
      )}
    </div>
  );
}
