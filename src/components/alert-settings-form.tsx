"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ALERT_SETTINGS, type AlertSettingKind, type AlertSettings } from "@/lib/alert-settings";

/** One switch per kind of push. Each change saves on its own, right away. */
export function AlertSettingsForm({ initial }: { initial: AlertSettings }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState<AlertSettingKind | null>(null);

  async function toggle(kind: AlertSettingKind, enabled: boolean) {
    const previous = settings;
    setSettings({ ...settings, [kind]: enabled });
    setSaving(kind);
    try {
      const res = await fetch("/api/alert-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSettings(previous);
      toast.error("Couldn't save that setting, so it's back to how it was.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <ul className="flex flex-col">
      {ALERT_SETTINGS.map(({ kind, label, description }) => (
        <li key={kind} className="flex items-center justify-between gap-6 border-t border-border py-3.5 first:border-t-0 first:pt-0">
          <label htmlFor={`alert-${kind}`} className="flex min-w-0 cursor-pointer flex-col gap-0.5">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </label>
          <Switch
            id={`alert-${kind}`}
            checked={settings[kind]}
            disabled={saving === kind}
            onCheckedChange={(checked) => toggle(kind, checked)}
          />
        </li>
      ))}
    </ul>
  );
}
