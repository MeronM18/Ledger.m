import { useId } from "react";
import type { InstallmentIcon } from "@/lib/installments";
import { cn } from "@/lib/utils";

// Line drawings of what an installment plan is paying for, in hairline
// bone. The screen (or the case, for AirPods and a box) lights up in
// champagne to how much of it is paid, rising from the bottom like a pill;
// moss once it's paid off.

type Screen = { x: number; y: number; w: number; h: number; r: number };

const SCREENS: Record<InstallmentIcon, Screen> = {
  laptop: { x: 22, y: 10, w: 76, h: 48, r: 1.5 },
  phone: { x: 47.5, y: 7.5, w: 25, h: 63, r: 4.5 },
  tablet: { x: 36, y: 10, w: 48, h: 62, r: 2.5 },
  watch: { x: 45, y: 20, w: 30, h: 40, r: 7.5 },
  headphones: { x: 38, y: 36, w: 44, h: 34, r: 10 },
  other: { x: 30, y: 34, w: 60, h: 38, r: 3 },
};

function Outline({ icon }: { icon: InstallmentIcon }) {
  switch (icon) {
    case "laptop":
      return (
        <>
          <rect x="18" y="6" width="84" height="56" rx="4.5" />
          <rect x="22" y="10" width="76" height="48" rx="1.5" />
          <rect x="55.5" y="10" width="9" height="2.4" rx="1.2" className="fill-current stroke-none opacity-60" />
          <path d="M6 64.5h108v1.6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4Z" />
          <path d="M50 64.5v.6a1.6 1.6 0 0 0 1.6 1.6h16.8a1.6 1.6 0 0 0 1.6-1.6v-.6" />
        </>
      );
    case "phone":
      return (
        <>
          <rect x="44" y="4" width="32" height="70" rx="7" />
          <rect x="47.5" y="7.5" width="25" height="63" rx="4.5" />
          <rect x="55.5" y="10.5" width="9" height="3" rx="1.5" className="fill-current stroke-none opacity-60" />
          <path d="M76 22v7M44 20v4M44 27v6" />
        </>
      );
    case "tablet":
      return (
        <>
          <rect x="32" y="6" width="56" height="70" rx="5.5" />
          <rect x="36" y="10" width="48" height="62" rx="2.5" />
          <circle cx="60" cy="8" r="0.9" className="fill-current stroke-none opacity-60" />
        </>
      );
    case "watch":
      return (
        <>
          <path d="M49 16V6a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v10M49 64v10a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V64" />
          <rect x="41" y="16" width="38" height="48" rx="11" />
          <rect x="45" y="20" width="30" height="40" rx="7.5" />
          <rect x="79" y="30" width="3" height="9" rx="1.5" />
        </>
      );
    case "headphones":
      return (
        <>
          <rect x="34" y="16" width="52" height="58" rx="13" />
          <path d="M34 34h52" />
          <circle cx="60" cy="46" r="1.3" className="fill-current stroke-none opacity-60" />
        </>
      );
    case "other":
      return (
        <>
          <path d="M26 20h68l-4 14H30Z" />
          <rect x="30" y="34" width="60" height="38" rx="3" />
          <path d="M54 34v12h12V34" />
        </>
      );
  }
}

export function DeviceArt({
  icon,
  progress,
  done = false,
  animate = true,
  className,
}: {
  icon: InstallmentIcon;
  // 0 to 1: how much of it is paid.
  progress: number;
  done?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const clip = useId();
  const s = SCREENS[icon];
  const p = Math.max(0, Math.min(1, progress));
  const fillHeight = s.h * p;
  const tone = done ? "var(--color-moss)" : "var(--color-champagne)";

  return (
    <svg viewBox="0 0 120 80" className={cn("text-bone/45", className)} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} />
        </clipPath>
      </defs>
      {p > 0 && (
        <g clipPath={`url(#${clip})`}>
          <g className={animate ? "animate-installment-fill" : undefined}>
            <rect x={s.x} y={s.y + s.h - fillHeight} width={s.w} height={fillHeight} fill={tone} opacity={0.2} />
            {!done && <rect x={s.x} y={s.y + s.h - fillHeight} width={s.w} height={0.9} fill={tone} opacity={0.85} />}
          </g>
        </g>
      )}
      <g fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
        <Outline icon={icon} />
      </g>
      {done && (
        <path
          d={`M${s.x + s.w / 2 - 6} ${s.y + s.h / 2}l4 4 8-8`}
          fill="none"
          stroke="var(--color-moss)"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
