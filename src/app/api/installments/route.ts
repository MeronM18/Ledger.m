import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { addedPlanSchema, planSettingsSchema, type InstallmentPrefs } from "@/lib/installments";
import { createAdminClient } from "@/lib/supabase/admin";
import { INSTALLMENTS_KEY, loadInstallmentPrefs } from "@/lib/ui-preferences";

// Installment plans live in ui_preferences: what you've set on a plan found
// in your charges (by its key), and the plans you added yourself.

const addSchema = addedPlanSchema.omit({ id: true });
const keySchema = z.string().min(1).max(120);
const patchSchema = z.object({ key: keySchema, settings: planSettingsSchema.merge(addSchema.partial()) });
const deleteSchema = z.object({ key: keySchema });

type AdminClient = ReturnType<typeof createAdminClient>;

async function load(admin: AdminClient): Promise<InstallmentPrefs | NextResponse> {
  const { prefs, error } = await loadInstallmentPrefs(admin);
  // Saving over prefs that couldn't be read would lose them.
  return error ? NextResponse.json({ error: "Couldn't read your installment plans" }, { status: 500 }) : prefs;
}

async function save(admin: AdminClient, prefs: InstallmentPrefs) {
  const { error } = await admin.from("ui_preferences").upsert({ key: INSTALLMENTS_KEY, value: prefs }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save installment plans", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Add a plan of your own. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const admin = createAdminClient();
  const prefs = await load(admin);
  if (prefs instanceof NextResponse) return prefs;
  if (prefs.added.length >= 50) return NextResponse.json({ error: "That's a lot of plans. Remove a finished one first." }, { status: 400 });
  // Checked whole, so nothing saved here is later dropped as unreadable.
  const plan = addedPlanSchema.safeParse({ id: `added-${crypto.randomUUID()}`, ...parsed.data });
  if (!plan.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  prefs.added.push(plan.data);
  return save(admin, prefs);
}

/** Change a plan: one you added, or what you've set on one that was found. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const admin = createAdminClient();
  const prefs = await load(admin);
  if (prefs instanceof NextResponse) return prefs;
  const { key, settings } = parsed.data;

  const added = prefs.added.findIndex((p) => p.id === key);
  if (added >= 0) {
    // Anything that isn't part of an added plan (hidden) is dropped by the parse.
    const next = addedPlanSchema.safeParse({ ...prefs.added[added], ...settings });
    if (!next.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    prefs.added[added] = next.data;
  } else {
    // A found plan keeps its amount and dates from its charges.
    const { name, icon, payments, price, hidden } = settings;
    const changes = Object.fromEntries(Object.entries({ name, icon, payments, price, hidden }).filter(([, v]) => v !== undefined));
    prefs.detected[key] = { ...(prefs.detected[key] ?? {}), ...changes };
  }
  return save(admin, prefs);
}

/** Remove a plan you added, or hide one that was found (it isn't an installment). */
export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const admin = createAdminClient();
  const prefs = await load(admin);
  if (prefs instanceof NextResponse) return prefs;
  const { key } = parsed.data;

  if (prefs.added.some((p) => p.id === key)) prefs.added = prefs.added.filter((p) => p.id !== key);
  else prefs.detected[key] = { ...(prefs.detected[key] ?? {}), hidden: true };
  return save(admin, prefs);
}
