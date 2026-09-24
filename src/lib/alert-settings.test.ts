import { describe, expect, it } from "vitest";
import { ALERT_SETTING_KINDS, resolveAlertSettings } from "@/lib/alert-settings";

describe("resolveAlertSettings", () => {
  it("turns everything on when nothing is stored", () => {
    const settings = resolveAlertSettings(null);
    expect(ALERT_SETTING_KINDS.every((k) => settings[k])).toBe(true);
  });

  it("keeps what was switched off, and treats anything else as on", () => {
    const settings = resolveAlertSettings({ transaction: false, renewal: true, "low-balance": "nonsense", made_up: false });
    expect(settings.transaction).toBe(false);
    expect(settings.renewal).toBe(true);
    expect(settings["low-balance"]).toBe(true);
    expect("made_up" in settings).toBe(false);
  });
});
