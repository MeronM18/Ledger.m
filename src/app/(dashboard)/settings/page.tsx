import Link from "next/link";
import { ArrowRight, Download, Upload } from "lucide-react";
import { AlertSettingsForm } from "@/components/alert-settings-form";
import { MerchantRulesButton } from "@/components/merchant-rules-manager";
import { RestoreBackupButton } from "@/components/restore-backup-button";
import {
  ConnectionsList,
  DisplayNameForm,
  ResetLayoutButton,
  SettingRow,
  SignOutButtons,
  TestAlertButton,
  ThresholdsForm,
  type Connection,
} from "@/components/settings-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { accountName } from "@/lib/account-settings";
import { DEFAULT_THRESHOLDS, maskTopic } from "@/lib/app-preferences";
import { requireUser } from "@/lib/auth";
import { CARD_ORDER_PAGES, cardOrderKey } from "@/lib/card-order";
import { DISPLAY_NAME } from "@/lib/config";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/format";
import { needsReconnect, statusLabel } from "@/lib/item-status";
import { cn } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MerchantRule } from "@/lib/transaction-edits";
import {
  loadAccountSettings,
  loadAlertSettings,
  loadAlertThresholds,
  loadDisplayName,
  loadImportLog,
} from "@/lib/ui-preferences";

export const metadata = { title: "Settings" };

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "alerts", label: "Alerts" },
  { id: "connections", label: "Connections" },
  { id: "rules", label: "Rules & imports" },
  { id: "layout", label: "Layout" },
  { id: "data", label: "Data" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

type ItemRow = {
  id: string;
  institution_name: string | null;
  status: string;
  error_code: string | null;
  last_synced_at: string | null;
  accounts: { id: string; name: string; official_name: string | null; mask: string | null; subtype: string | null; type: string; current_balance: number | null; is_hidden: boolean | null }[];
};

const usd = (n: number) => formatCurrency(n, "USD").replace(/\.00$/, "");

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function Section({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col">{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const admin = createAdminClient();
  const { tab: tabParam } = await searchParams;
  const tab: SectionId = SECTIONS.find((sec) => sec.id === tabParam)?.id ?? "profile";
  const [user, alertSettings, thresholds, displayName, accountSettings, { log: importLog }, itemsRes, rulesRes, orderRes] = await Promise.all([
    requireUser(),
    loadAlertSettings(admin),
    loadAlertThresholds(admin),
    loadDisplayName(admin),
    loadAccountSettings(admin),
    loadImportLog(admin),
    admin
      .from("items")
      .select("id, institution_name, status, error_code, last_synced_at, accounts(id, name, official_name, mask, subtype, type, current_balance, is_hidden)")
      .order("created_at"),
    admin.from("merchant_rules").select("id, match_text, rename_to, category, created_at").order("created_at", { ascending: false }),
    admin.from("ui_preferences").select("key").in("key", CARD_ORDER_PAGES.map(cardOrderKey)),
  ]);

  if (itemsRes.error) console.error("Failed to load connections for settings", itemsRes.error);
  if (rulesRes.error) console.error("Failed to load merchant rules for settings", rulesRes.error);

  const connections: Connection[] = ((itemsRes.data ?? []) as unknown as ItemRow[]).map((item) => {
    const institution = item.institution_name ?? "Bank";
    const label = statusLabel(item);
    return {
      id: item.id,
      institution,
      ok: !needsReconnect(item) && item.status !== "error",
      status: item.last_synced_at ? `${label} · synced ${when(item.last_synced_at)}` : label,
      accounts: item.accounts.map((a) => ({
        id: a.id,
        name: accountName(a, accountSettings[a.id]),
        detail: [a.subtype ? a.subtype.charAt(0).toUpperCase() + a.subtype.slice(1) : a.type, a.mask ? `••${a.mask}` : null].filter(Boolean).join(" "),
        hidden: Boolean(a.is_hidden),
        balance: a.current_balance === null ? null : Number(a.current_balance),
      })),
    };
  });
  const hiddenCount = connections.reduce((n, c) => n + c.accounts.filter((a) => a.hidden).length, 0);

  const rules = (rulesRes.data ?? []) as MerchantRule[];
  const imports = Object.values(importLog).flat();
  const lastImport = imports.reduce<string | null>((max, r) => (max === null || r.at > max ? r.at : max), null);
  const customizedLayout = (orderRes.data ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Settings</h1>

      {/* One section at a time, picked from tabs like Reports'. */}
      <nav aria-label="Settings sections" className="-mt-2 flex items-center gap-1 overflow-x-auto">
        {SECTIONS.map((sec) => {
          const active = sec.id === tab;
          return (
            <Link
              key={sec.id}
              href={sec.id === "profile" ? "/settings" : `/settings?tab=${sec.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative mb-1.5 shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-bone/6",
                "after:absolute after:inset-x-2 after:-bottom-1.5 after:h-0.5 after:rounded-full after:transition-colors",
                active ? "font-medium text-bone after:bg-champagne" : "text-muted-foreground/80 after:bg-transparent hover:text-bone"
              )}
            >
              {sec.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex w-full max-w-3xl flex-col gap-6">
        {tab === "profile" && (
          <Section id="profile" title="Profile">
            <SettingRow htmlFor="display-name" label="Your name" description="How the Overview greets you.">
              <DisplayNameForm initial={displayName} fallback={DISPLAY_NAME} />
            </SettingRow>
            <SettingRow
              label="Signed in as"
              description={
                <>
                  {user.email}
                  {user.last_sign_in_at ? ` · last sign-in ${when(user.last_sign_in_at)}` : ""}. Only this address can sign in, with
                  a link sent to it.
                </>
              }
            >
              <SignOutButtons />
            </SettingRow>
          </Section>
        )}

        {tab === "alerts" && (
          <>
            <Section
              id="alerts"
              title="Delivery"
              description={
                <>
                  Alerts are pushed to your phone through ntfy (topic <span className="font-mono text-bone">{maskTopic(env.NTFY_TOPIC)}</span>{" "}
                  on {new URL(env.NTFY_SERVER).host}).
                </>
              }
            >
              <SettingRow label="Check delivery" description="Sends one push now, so you know alerts reach your phone.">
                <TestAlertButton />
              </SettingRow>
            </Section>
            <Section id="thresholds" title="Thresholds" description="The amounts and days alerts go by.">
              <ThresholdsForm initial={thresholds} defaults={DEFAULT_THRESHOLDS} />
            </Section>
            <Section id="which-alerts" title="Which alerts" description="Switching one off stops it being sent or listed under Recent alerts.">
              <AlertSettingsForm
                initial={alertSettings}
                descriptions={{
                  "large-charge": `Any single charge of ${usd(thresholds.largeCharge)} or more, even with the one above off.`,
                  renewal: `A subscription charging within ${thresholds.renewalDaysAhead} day${thresholds.renewalDaysAhead === 1 ? "" : "s"}.`,
                  "low-balance": `A checking or savings account under ${usd(thresholds.lowBalance)}, at most weekly.`,
                }}
              />
            </Section>
          </>
        )}

        {tab === "connections" && (
          <Section
            id="connections"
            title="Connections"
            description={
              <>
                Banks connected through Plaid. A hidden account stays synced but is left out of net worth, the Overview, alerts,
                goals and the forecast{hiddenCount > 0 ? ` (${hiddenCount} hidden now)` : ""}. Nicknames, statement days and
                rewards are set on each card on Accounts.
              </>
            }
          >
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No banks connected yet.</p>
            ) : (
              <ConnectionsList connections={connections} />
            )}
            <div className="flex flex-wrap gap-2 pt-4">
              <Button asChild size="sm" variant="outline">
                <Link href="/accounts">
                  Connect a bank or edit card details
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </Section>
        )}

        {tab === "rules" && (
          <Section id="rules" title="Rules & imports">
            <SettingRow
              label="Merchant rules"
              description={
                rules.length === 0
                  ? "None yet. Make one from a transaction: open it and apply its name or category to every match."
                  : `${rules.length} rule${rules.length === 1 ? "" : "s"} renaming or recategorizing merchants, past and future.`
              }
            >
              <MerchantRulesButton rules={rules} label="Manage rules" />
            </SettingRow>
            <SettingRow
              label="Apple Card and Apple Savings statements"
              description={
                lastImport
                  ? `${imports.length} import${imports.length === 1 ? "" : "s"}, the latest on ${when(lastImport)}. Import each month's statement from Transactions.`
                  : "Nothing imported yet. Import a statement from Transactions."
              }
            >
              <Button asChild size="sm" variant="outline">
                <Link href="/transactions">
                  <Upload className="size-3.5" />
                  Go to Transactions
                </Link>
              </Button>
            </SettingRow>
          </Section>
        )}

        {tab === "layout" && (
          <Section id="layout" title="Layout">
            <SettingRow
              label="Card order"
              description={
                customizedLayout
                  ? "You've rearranged cards on the Overview or Accounts. This puts them back in the default order."
                  : "Cards on the Overview and Accounts are in their default order. Drag any card's handle to rearrange."
              }
            >
              <ResetLayoutButton customized={customizedLayout} />
            </SettingRow>
          </Section>
        )}

        {tab === "data" && (
          <Section
            id="data"
            title="Data"
            description="One file with everything in Ledger.m: every transaction and your edits to them, merchant rules, manual entries and accounts, subscriptions, budgets, goals, assets, net worth history and settings. Bank logins and access tokens are never included."
          >
            <SettingRow label="Download a backup" description="A JSON file you can keep, or restore from later.">
              <Button asChild size="sm" variant="outline">
                <a href="/api/export" download>
                  <Download className="size-3.5" aria-hidden />
                  Download backup
                </a>
              </Button>
            </SettingRow>
            <SettingRow
              label="Restore from a backup"
              description="Brings back everything you made, as it was in the file, without deleting anything added since. Bank data comes back by reconnecting the bank."
            >
              <RestoreBackupButton />
            </SettingRow>
          </Section>
        )}
      </div>
    </div>
  );
}
