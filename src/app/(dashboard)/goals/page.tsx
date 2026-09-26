import { GoalsManager, NewGoalButton } from "@/components/goals-manager";
import { QueryErrorState } from "@/components/query-error";
import { dollars } from "@/lib/goal-copy";
import { goalsSummary } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Goals" };

function Stat({ label, value, note, tone, share }: { label: string; value: string; note: string; tone?: "bad"; share?: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5">
      <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-2xl font-semibold tabular-nums", tone === "bad" ? "text-oxblood-text" : "text-bone")}>{value}</span>
      {share !== undefined && (
        <span className="my-1 h-1 overflow-hidden rounded-full bg-bone/8" aria-hidden>
          <span className="block h-full rounded-full bg-champagne" style={{ width: `${Math.min(1, share) * 100}%` }} />
        </span>
      )}
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

export default async function GoalsPage() {
  const admin = createAdminClient();
  const { rows, accounts, pay, thisMonth, error } = await loadGoals(admin);
  const now = calendarNow();
  const today = now.isoDate;

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
        <QueryErrorState message="Couldn't load your goals. Try refreshing the page." />
      </div>
    );
  }

  const summary = goalsSummary(rows);
  // What every dated goal needs a month, together, and that as a share of pay.
  const plans = rows.flatMap((g) => (g.insight.plan && g.status !== "complete" ? [g.insight.plan.perMonth] : []));
  const monthly = plans.reduce((s, v) => s + v, 0);
  const share = pay?.typicalMonth && monthly > 0 ? monthly / pay.typicalMonth : null;
  const moved = thisMonth ? Math.round((thisMonth.added - thisMonth.out) * 100) / 100 : null;
  const monthName = now.monthLabel.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-end justify-between gap-3 md:pr-12">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
          <p className="text-sm text-muted-foreground">What you&apos;re saving for, and how close you are.</p>
        </div>
        {rows.length > 0 && <NewGoalButton accounts={accounts} pay={pay} today={today} />}
      </div>

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Saved toward goals"
            value={dollars(summary.saved)}
            note={`of ${dollars(summary.target)} · ${summary.completed} of ${rows.length} reached`}
            share={summary.target > 0 ? summary.saved / summary.target : 0}
          />
          <Stat
            label={`Put in this ${monthName}`}
            value={moved === null ? "—" : `${moved < 0 ? "−" : ""}${dollars(Math.abs(moved))}`}
            tone={moved !== null && moved < 0 ? "bad" : undefined}
            note={
              moved === null
                ? "Shows for goals that follow an account"
                : thisMonth!.interest >= 0.5
                  ? `plus ${dollars(thisMonth!.interest)} interest`
                  : moved < 0
                    ? "more came out than went in"
                    : "moved into your goal accounts"
            }
          />
          <Stat
            label="Needed each month"
            value={monthly > 0 ? dollars(monthly) : "—"}
            note={monthly > 0 ? (share !== null ? `about ${Math.round(share * 100)}% of your pay, across dated goals` : "across your dated goals") : "Give a goal a date to get a plan"}
          />
        </div>
      )}

      <GoalsManager goals={rows} accounts={accounts} pay={pay} today={today} />
    </div>
  );
}
