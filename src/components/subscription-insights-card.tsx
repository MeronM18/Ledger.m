import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight } from "@/lib/subscription-insights";

export function SubscriptionInsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <Card className="border-champagne/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="size-4 text-champagne" aria-hidden />
          Worth a look
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {insights.map((i) => (
          <div key={`${i.kind}-${i.keys.join(",")}`} className="border-t border-border py-2.5 first:border-t-0 first:pt-0">
            <p className="text-sm text-bone">{i.title}</p>
            <p className="text-xs text-muted-foreground">{i.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
