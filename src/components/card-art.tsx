import { brandPath } from "@/components/institution-avatar";
import type { ProgramId } from "@/lib/card-rewards";
import { cn } from "@/lib/utils";

// Drawn, not photographed: each card's look (color, finish, network mark)
// in CSS and SVG, so it stays sharp at any size and needs no image files.
const LOOKS: Record<ProgramId, { background: string; ink: string; label: string | null; network: "visa" | "mastercard" }> = {
  "sapphire-preferred": {
    background: "linear-gradient(135deg, #0c2a52 0%, #1d4f8c 52%, #0a1f3d 100%)",
    ink: "#e8eef7",
    label: "SAPPHIRE",
    network: "visa",
  },
  "freedom-flex": {
    background: "linear-gradient(135deg, #0a1b36 0%, #133f78 60%, #0d2a55 100%)",
    ink: "#e6f0ff",
    label: "freedom flex",
    network: "mastercard",
  },
  "apple-card": {
    background: "linear-gradient(160deg, #fbfbfd 0%, #eceef1 55%, #d9dbe0 100%)",
    ink: "#111111",
    label: null,
    network: "mastercard",
  },
};

function Mastercard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 20" className={className} aria-hidden>
      <circle cx="12" cy="10" r="8" fill="#eb001b" />
      <circle cx="20" cy="10" r="8" fill="#f79e1b" fillOpacity="0.9" />
    </svg>
  );
}

/** A small picture of the card, in the program's colors, with its last four digits. */
export function CardArt({ program, mask, className }: { program: ProgramId; mask?: string | null; className?: string }) {
  const look = LOOKS[program];
  const apple = program === "apple-card";
  return (
    <div
      className={cn("relative aspect-[1.586] overflow-hidden rounded-lg shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/10", className)}
      style={{ background: look.background, color: look.ink }}
      aria-hidden
    >
      {/* A soft sheen across the face, like light on a real card. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,255,255,0.22),transparent_55%)]" />
      {program === "freedom-flex" && (
        <div className="absolute -right-6 -bottom-8 size-24 rounded-full border-[6px] border-sky-300/20" />
      )}
      <svg viewBox="0 0 24 24" className={cn("absolute top-[9%] left-[7%]", apple ? "size-[16%]" : "size-[13%]")} fill={apple ? "#111" : "currentColor"}>
        <path d={brandPath(apple ? "apple" : "chase")} />
      </svg>
      {look.label && (
        <span
          className={cn(
            "absolute top-[11%] right-[7%] text-[0.5rem] leading-none",
            program === "sapphire-preferred" ? "font-semibold tracking-[0.28em]" : "font-medium tracking-wide lowercase italic"
          )}
        >
          {look.label}
        </span>
      )}
      {/* The chip. */}
      <span className="absolute top-[40%] left-[7%] h-[18%] w-[14%] rounded-[3px] bg-[linear-gradient(135deg,#e9d8a6,#b89b5e)] opacity-90" />
      {mask && !apple && <span className="absolute bottom-[10%] left-[7%] font-mono text-[0.55rem] tracking-widest opacity-90">•• {mask}</span>}
      {look.network === "visa" ? (
        <span className="absolute right-[7%] bottom-[8%] text-[0.7rem] font-black tracking-tight italic">VISA</span>
      ) : (
        <Mastercard className="absolute right-[6%] bottom-[8%] h-[16%] w-auto" />
      )}
    </div>
  );
}
