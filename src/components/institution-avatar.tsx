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

// A bank's own mark where we have one (Apple, Chase and American Express
// from Simple Icons, CC0; Fifth Third's leaf-shaped "5/3" drawn after its
// logo), else its initial in a steady color from its name.
type Mark = { kind: "path"; d: string; bg: string; fg: string; scale: number } | { kind: "fifth-third" };

const MARKS: [RegExp, Mark][] = [
  [/apple/i, { kind: "path", d: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701", bg: "#ffffff", fg: "#000000", scale: 0.56 }],
  [/chase/i, { kind: "path", d: "M0 15.415c0 .468.38.85.848.85h5.937V.575L0 7.72v7.695m15.416 8.582c.467 0 .846-.38.846-.849v-5.937H.573l7.146 6.785h7.697M24 8.587a.844.844 0 0 0-.847-.846h-5.938V23.43l6.782-7.148L24 8.586M8.585.003a.847.847 0 0 0-.847.847v5.94h15.688L16.282.003H8.585Z", bg: "#ffffff", fg: "#117aca", scale: 0.6 }],
  [/american express|amex/i, { kind: "path", d: "M16.015 14.378c0-.32-.135-.496-.344-.622-.21-.12-.464-.135-.81-.135h-1.543v2.82h.675v-1.027h.72c.24 0 .39.024.478.125.12.13.104.38.104.55v.35h.66v-.555c-.002-.25-.017-.376-.108-.516-.06-.08-.18-.18-.33-.234l.02-.008c.18-.072.48-.297.48-.747zm-.87.407l-.028-.002c-.09.053-.195.058-.33.058h-.81v-.63h.824c.12 0 .24 0 .33.05.098.048.156.147.15.255 0 .12-.045.215-.134.27zM20.297 15.837H19v.6h1.304c.676 0 1.05-.278 1.05-.884 0-.28-.066-.448-.187-.582-.153-.133-.392-.193-.73-.207l-.376-.015c-.104 0-.18 0-.255-.03-.09-.03-.15-.105-.15-.21 0-.09.017-.166.09-.21.083-.046.177-.066.272-.06h1.23v-.602h-1.35c-.704 0-.958.437-.958.84 0 .9.776.855 1.407.87.104 0 .18.015.225.06.046.03.082.106.082.18 0 .077-.035.15-.08.18-.06.053-.15.07-.277.07zM0 0v10.096L.81 8.22h1.75l.225.464V8.22h2.043l.45 1.02.437-1.013h6.502c.295 0 .56.057.756.236v-.23h1.787v.23c.307-.17.686-.23 1.12-.23h2.606l.24.466v-.466h1.918l.254.465v-.466h1.858v3.948H20.87l-.36-.6v.585h-2.353l-.256-.63h-.583l-.27.614h-1.213c-.48 0-.84-.104-1.08-.24v.24h-2.89v-.884c0-.12-.03-.12-.105-.135h-.105v1.036H6.067v-.48l-.21.48H4.69l-.202-.48v.465H2.235l-.256-.624H1.4l-.256.624H0V24h23.786v-7.108c-.27.135-.613.18-.973.18H21.09v-.255c-.21.165-.57.255-.914.255H14.71v-.9c0-.12-.018-.12-.12-.12h-.075v1.022h-1.8v-1.066c-.298.136-.643.15-.928.136h-.214v.915h-2.18l-.54-.617-.57.6H4.742v-3.93h3.61l.518.602.554-.6h2.412c.28 0 .74.03.942.225v-.24h2.177c.202 0 .644.045.903.225v-.24h3.265v.24c.163-.164.508-.24.803-.24h1.89v.24c.194-.15.464-.24.84-.24h1.176V0H0zM21.156 14.955c.004.005.006.012.01.016.01.01.024.01.032.02l-.042-.035zM23.828 13.082h.065v.555h-.065zM23.865 15.03v-.005c-.03-.025-.046-.048-.075-.07-.15-.153-.39-.215-.764-.225l-.36-.012c-.12 0-.194-.007-.27-.03-.09-.03-.15-.105-.15-.21 0-.09.03-.16.09-.204.076-.045.15-.05.27-.05h1.223v-.588h-1.283c-.69 0-.96.437-.96.84 0 .9.78.855 1.41.87.104 0 .18.015.224.06.046.03.076.106.076.18 0 .07-.034.138-.09.18-.045.056-.136.07-.27.07h-1.288v.605h1.287c.42 0 .734-.118.9-.36h.03c.09-.134.135-.3.135-.523 0-.24-.045-.39-.135-.526zM18.597 14.208v-.583h-2.235V16.458h2.235v-.585h-1.57v-.57h1.533v-.584h-1.532v-.51M13.51 8.787h.685V11.6h-.684zM13.126 9.543l-.007.006c0-.314-.13-.5-.34-.624-.217-.125-.47-.135-.81-.135H10.43v2.82h.674v-1.034h.72c.24 0 .39.03.487.12.122.136.107.378.107.548v.354h.677v-.553c0-.25-.016-.375-.11-.516-.09-.107-.202-.19-.33-.237.172-.07.472-.3.472-.75zm-.855.396h-.015c-.09.054-.195.056-.33.056H11.1v-.623h.825c.12 0 .24.004.33.05.09.04.15.128.15.25s-.047.22-.134.266zM15.92 9.373h.632v-.6h-.644c-.464 0-.804.105-1.02.33-.286.3-.362.69-.362 1.11 0 .512.123.833.36 1.074.232.238.645.31.97.31h.78l.255-.627h1.39l.262.627h1.36v-2.11l1.272 2.11h.95l.002.002V8.786h-.684v1.963l-1.18-1.96h-1.02V11.4L18.11 8.744h-1.004l-.943 2.22h-.3c-.177 0-.362-.03-.468-.134-.125-.15-.186-.36-.186-.662 0-.285.08-.51.194-.63.133-.135.272-.165.516-.165zm1.668-.108l.464 1.118v.002h-.93l.466-1.12zM2.38 10.97l.254.628H4V9.393l.972 2.205h.584l.973-2.202.015 2.202h.69v-2.81H6.118l-.807 1.904-.876-1.905H3.343v2.663L2.205 8.787h-.997L.01 11.597h.72l.26-.626h1.39zm-.688-1.705l.46 1.118-.003.002h-.915l.457-1.12zM11.856 13.62H9.714l-.85.923-.825-.922H5.346v2.82H8l.855-.932.824.93h1.302v-.94h.838c.6 0 1.17-.164 1.17-.945l-.006-.003c0-.78-.598-.93-1.128-.93zM7.67 15.853l-.014-.002H6.02v-.557h1.47v-.574H6.02v-.51H7.7l.733.82-.764.824zm2.642.33l-1.03-1.147 1.03-1.108v2.253zm1.553-1.258h-.885v-.717h.885c.24 0 .42.098.42.344 0 .243-.15.372-.42.372zM9.967 9.373v-.586H7.73V11.6h2.237v-.58H8.4v-.564h1.527V9.88H8.4v-.507", bg: "#ffffff", fg: "#2e77bc", scale: 1.04 }],
  [/fifth third/i, { kind: "fifth-third" }],
];

const BRAND: [RegExp, string][] = [
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

// Cash is green, like money; other things not at a bank are champagne.
const ICON_COLOR: Partial<Record<AvatarIcon, string>> = { cash: "#4fb477", wallet: "#4fb477" };

/**
 * The round mark beside an account: the bank's own logo where we have it,
 * otherwise its initial in its color, or an icon for something that isn't
 * at a bank (cash, a car, metals).
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
    const mark = MARKS.find(([re]) => re.test(institution))?.[1];
    if (mark?.kind === "path") {
      return (
        <span
          aria-hidden
          className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10", box, className)}
          style={{ backgroundColor: mark.bg }}
        >
          <svg viewBox="0 0 24 24" fill={mark.fg} style={{ width: `${mark.scale * 100}%`, height: `${mark.scale * 100}%` }}>
            <path d={mark.d} />
          </svg>
        </span>
      );
    }
    if (mark?.kind === "fifth-third") {
      // Its logo: a blue leaf (rounded top right and bottom left) with a
      // green edge and a white "5/3".
      return (
        <svg aria-hidden viewBox="0 0 24 24" className={cn("shrink-0", box, className)}>
          <path d="M1 1h13a9 9 0 0 1 9 9v13H10a9 9 0 0 1-9-9Z" fill="#34c77b" />
          <path d="M2.8 2.8H14a7.2 7.2 0 0 1 7.2 7.2v11.2H10A7.2 7.2 0 0 1 2.8 14Z" fill="#1d3f97" />
          <text
            x="12"
            y="15.6"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="9.5"
            fontWeight="900"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing="-0.6"
          >
            5/3
          </text>
        </svg>
      );
    }
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
  const color = ICON_COLOR[icon ?? "bank"] ?? "var(--champagne)";
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full", box, className)}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)` }}
    >
      <Icon className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}
