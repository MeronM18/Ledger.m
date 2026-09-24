"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BedDouble,
  Beer,
  BookOpen,
  Building2,
  Car,
  CarTaxiFront,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Music,
  Package,
  ParkingMeter,
  PawPrint,
  Percent,
  Phone,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Store,
  Ticket,
  TrainFront,
  Truck,
  Tv,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { transactionIconColor, transactionIconName, type IconTransaction, type TransactionIconName } from "@/lib/transaction-icons";
import { cn } from "@/lib/utils";

const ICONS: Record<TransactionIconName, LucideIcon> = {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BedDouble,
  Beer,
  BookOpen,
  Building2,
  Car,
  CarTaxiFront,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Music,
  Package,
  ParkingMeter,
  PawPrint,
  Percent,
  Phone,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Store,
  Ticket,
  TrainFront,
  Truck,
  Tv,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
};

/**
 * The round avatar beside a transaction: the merchant's logo when the bank
 * sent one (and it loads), otherwise an icon for what it was.
 */
export function TransactionAvatar({ transaction, className }: { transaction: IconTransaction & { logo_url?: string | null }; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const logo = transaction.logo_url && transaction.logo_url !== broken ? transaction.logo_url : null;

  if (logo) {
    return (
      // A logo of any shape sits inside the same round badge as the icons,
      // so a wide wordmark doesn't look out of place in the list.
      <span className={cn("flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external Plaid-hosted logo, small avatar, not worth next/image config for a single-user app */}
        <img src={logo} alt="" onError={() => setBroken(logo)} className="size-full object-contain p-[12%]" />
      </span>
    );
  }
  const name = transactionIconName(transaction);
  const Icon = ICONS[name];
  const color = transactionIconColor(transaction);
  return (
    <span
      className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", className)}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)` }}
      data-icon={name}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
