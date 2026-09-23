import { AlertTriangle } from "lucide-react";

/**
 * Distinguishes "the query failed" from "there's genuinely no data" — every
 * page previously handled a failed Supabase query with console.error() and
 * a `?? []` fallback, which renders identically to a real empty state
 * ("No transactions yet.", etc.). A real outage or query bug should look
 * different from having zero data, not the same.
 */
export function QueryErrorState({
  message = "Couldn't load this data. Try refreshing the page.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-oxblood/30 bg-oxblood/5 py-10 text-center">
      <AlertTriangle className="size-5 text-oxblood-text" />
      <p className="text-sm text-oxblood-text">{message}</p>
    </div>
  );
}
