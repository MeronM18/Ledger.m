import {
  Baby,
  Briefcase,
  Car,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  House,
  Laptop,
  PawPrint,
  PiggyBank,
  Plane,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Umbrella,
  type LucideIcon,
} from "lucide-react";
import { colorVar, type GoalColor, type GoalIcon, type GoalOptions } from "@/lib/goal-options";
import { cn } from "@/lib/utils";

export const ICON_COMPONENTS: Record<GoalIcon, LucideIcon> = {
  "piggy-bank": PiggyBank,
  shield: ShieldCheck,
  plane: Plane,
  house: House,
  car: Car,
  briefcase: Briefcase,
  graduation: GraduationCap,
  gift: Gift,
  laptop: Laptop,
  heart: Heart,
  baby: Baby,
  paw: PawPrint,
  ring: Gem,
  umbrella: Umbrella,
  trending: TrendingUp,
  sparkles: Sparkles,
};

// A goal with no icon picked gets one from its name.
const BY_NAME: [RegExp, GoalIcon][] = [
  [/trip|travel|vacation|holiday|japan|europe|flight/i, "plane"],
  [/emergency|rainy|safety|cushion/i, "shield"],
  [/business|startup|company/i, "briefcase"],
  [/house|home|down ?payment|apartment|rent/i, "house"],
  [/car|truck|vehicle/i, "car"],
  [/school|college|tuition|degree|student/i, "graduation"],
  [/wedding|engagement|ring/i, "ring"],
  [/gift|christmas|birthday/i, "gift"],
  [/laptop|computer|phone|tech/i, "laptop"],
  [/baby|kid|child/i, "baby"],
  [/dog|cat|pet/i, "paw"],
  [/retire|invest/i, "trending"],
];

export function iconFor(name: string, options: Pick<GoalOptions, "icon">): GoalIcon {
  return options.icon ?? BY_NAME.find(([re]) => re.test(name))?.[1] ?? "piggy-bank";
}

export function accentFor(options: Pick<GoalOptions, "color">, complete = false): string {
  return complete ? "var(--moss)" : colorVar((options.color ?? "champagne") as GoalColor);
}

/** A goal's icon in a tinted circle of its color. */
export function GoalBadge({
  name,
  options,
  complete = false,
  className,
}: {
  name: string;
  options: Pick<GoalOptions, "icon" | "color">;
  complete?: boolean;
  className?: string;
}) {
  const Icon = ICON_COMPONENTS[iconFor(name, options)];
  const color = accentFor(options, complete);
  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", className)}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` }}
    >
      <Icon className="size-[45%]" aria-hidden />
    </span>
  );
}
