"use client";

import { WELCOME_COOKIE } from "@/lib/sidebar-state";
import { useEffect, useState } from "react";

const WORDMARK = ["L", "e", "d", "g", "e", "r", ".", "m"];
// The last two characters (".m") are the accent.
const ACCENT_FROM = 6;

/** One digit that rolls through a full turn before settling on `digit`, like a mechanical counter. */
function RollingDigit({ digit, index }: { digit: number; index: number }) {
  return (
    <span className="welcome-digit" style={{ "--i": index, "--to": digit } as React.CSSProperties}>
      <span className="welcome-digit-strip" aria-hidden>
        {Array.from({ length: 20 }, (_, n) => (
          <span key={n}>{n % 10}</span>
        ))}
      </span>
    </span>
  );
}

function Wordmark({ animated }: { animated: boolean }) {
  return WORDMARK.map((ch, i) => (
    <span key={i} className="welcome-letter-clip">
      <span
        className={i >= ACCENT_FROM && animated ? "welcome-letter text-champagne" : "welcome-letter"}
        style={{ "--i": i } as React.CSSProperties}
      >
        {ch}
      </span>
    </span>
  ));
}

/**
 * The opening on a full page load: a glow warms up, a ledger rule draws
 * across the middle with a glint running along it, the wordmark rises out
 * of it into focus and a sheen crosses it, today's date rolls into place
 * below, then it all dissolves (a touch larger, out of focus, faded) as the
 * page settles in behind. About 2.7 seconds (globals.css, "Welcome", has
 * the timeline). Clicks don't skip it; a key press does. Client-side
 * navigation doesn't replay it: this lives in the layout, which stays
 * mounted between pages.
 *
 * Rendered on the server, so it covers the first paint rather than
 * appearing after the page has flashed. The animation itself is CSS
 * (globals.css, "Welcome"); script only removes it afterwards and handles
 * skipping. It plays once a browser session; refreshes after that skip it.
 */
export function WelcomeOverlay({ month, day, year }: { month: string; day: string; year: string }) {
  const [phase, setPhase] = useState<"playing" | "leaving" | "gone">("playing");

  useEffect(() => {
    // Once a browser session: a session cookie (gone when the browser
    // closes) tells the layout not to draw it again on a refresh.
    document.cookie = `${WELCOME_COOKIE}=1; path=/; samesite=lax`;
    const skip = () => setPhase((p) => (p === "playing" ? "leaving" : p));
    window.addEventListener("keydown", skip);
    // A backstop in case the closing animation's end event never arrives
    // (a tab opened in the background doesn't run animations).
    const done = window.setTimeout(() => setPhase("gone"), 4500);
    return () => {
      window.removeEventListener("keydown", skip);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className="welcome"
      data-phase={phase}
      aria-hidden
      onAnimationEnd={(e) => {
        // The whole overlay finishing its fade is the end (not one of its
        // parts finishing its own).
        if (e.target === e.currentTarget && e.animationName.startsWith("welcome-dissolve")) setPhase("gone");
      }}
    >
      <div className="welcome-half welcome-top">
        <p className="welcome-wordmark font-serif">
          <Wordmark animated />
          <span className="welcome-sheen" aria-hidden>
            <Wordmark animated={false} />
          </span>
        </p>
      </div>
      <div className="welcome-half welcome-bottom">
        <p className="welcome-date font-mono">
          <span className="welcome-date-word">{`${month} `}</span>
          {[...day].map((d, i) => (
            <RollingDigit key={`d${i}`} digit={Number(d)} index={i} />
          ))}
          <span className="welcome-date-word">{", "}</span>
          {[...year].map((d, i) => (
            <RollingDigit key={`y${i}`} digit={Number(d)} index={i + 2} />
          ))}
        </p>
      </div>
      <div className="welcome-glow" />
      <div className="welcome-rule">
        <span className="welcome-glint" />
      </div>
    </div>
  );
}
