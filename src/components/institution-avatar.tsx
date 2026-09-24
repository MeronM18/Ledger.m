import {
  Banknote,
  Car,
  Coins,
  Gem,
  House,
  Landmark,
  Package,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// A bank's own color, for the ones in use; others get a steady color from
// their name. The monogram is the bank's first letter.
const BRAND: [RegExp, string][] = [
  [/chase/i, "#1a6fc2"],
  [/american express|amex/i, "#2e77bc"],
  [/fifth third/i, "#1f7a3f"],
  [/apple/i, "#8e8e93"],
  [/bank of america/i, "#c8102e"],
  [/wells fargo/i, "#c8161d"],
  [/capital one/i, "#004977"],
  [/citi/i, "#0e5ea8"],
  [/discover/i, "#e0761f"],
  [/ally/i, "#6b1f7a"],
];
const FALLBACK = ["var(--cat-shopping)", "var(--cat-transport)", "var(--cat-entertainment)", "var(--cat-food)", "var(--cat-home)"];

function colorFor(name: string): string {
  const brand = BRAND.find(([re]) => re.test(name));
  if (brand) return brand[1];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

export type AvatarIcon = "cash" | "vehicle" | "property" | "crypto" | "metals" | "other" | "wallet" | "bank";

const ICONS: Record<AvatarIcon, LucideIcon> = {
  cash: Banknote,
  vehicle: Car,
  property: House,
  crypto: Coins,
  metals: Gem,
  other: Package,
  wallet: Wallet,
  bank: Landmark,
};

/**
 * The round mark beside an account: the bank's initial in its color, or an
 * icon for something that isn't at a bank (cash, a car, metals).
 */
export function InstitutionAvatar({
  institution,
  icon,
  size = "md",
  className,
}: {
  institution?: string | null;
  icon?: AvatarIcon;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "size-5 text-[10px]" : "size-8 text-sm";
  if (institution && !icon) {
    const color = colorFor(institution);
    return (
      <span
        aria-hidden
        className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", box, className)}
        style={{ backgroundColor: `color-mix(in oklab, ${color} 82%, black)` }}
      >
        {institution.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  const Icon = ICONS[icon ?? "bank"];
  const color = "var(--champagne)";
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full", box, className)}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` }}
    >
      <Icon className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}
