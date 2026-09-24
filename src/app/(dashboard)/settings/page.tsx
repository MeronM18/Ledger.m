import { Download } from "lucide-react";
import { AlertSettingsForm } from "@/components/alert-settings-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAlertSettings } from "@/lib/ui-preferences";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await loadAlertSettings(createAdminClient());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Push alerts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sent to your phone through ntfy. Switching one off stops it being sent or listed under Recent alerts.
          </p>
        </CardHeader>
        <CardContent>
          <AlertSettingsForm initial={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            One file with everything in Ledger.m: every transaction and your edits to them, merchant rules, manual
            entries and accounts, subscriptions, budgets, goals, assets, net worth history and settings. Bank logins
            and access tokens are never included.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/export" download>
              <Download className="size-4" aria-hidden />
              Download backup (JSON)
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
