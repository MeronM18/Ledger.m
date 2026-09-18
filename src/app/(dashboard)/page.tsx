import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <Card>
        <CardHeader>
          <CardTitle>Net worth</CardTitle>
          <CardDescription>Coming in a later phase.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Connect an account on the Accounts page to get started.
        </CardContent>
      </Card>
    </div>
  );
}
