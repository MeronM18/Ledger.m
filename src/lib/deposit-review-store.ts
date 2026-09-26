import "server-only";
import { z } from "zod";
import { adjustCashAsset } from "@/lib/cash-asset-sync";
import { resolveDepositReviews, type DepositReview, type ReviewPart } from "@/lib/deposit-review";
import { ALL_PFC_CATEGORIES } from "@/lib/plaid-categories";
import type { createAdminClient } from "@/lib/supabase/admin";
import { humanizeTransactionName } from "@/lib/transaction-display";
import { DEPOSIT_REVIEWS_KEY } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const money = z.number().positive().max(10_000_000);

const partSchema = z.discriminatedUnion("answer", [
  z.object({ answer: z.literal("income"), amount: money }),
  z.object({ answer: z.literal("own-money"), amount: money, from: z.enum(["cash", "account"]) }),
  z.object({ answer: z.literal("paid-back"), amount: money, charge: z.object({ id: z.string().min(1), manual: z.boolean() }) }),
  z.object({
    answer: z.literal("paid-back-cash"),
    amount: money,
    purchase: z.object({
      name: z.string().trim().min(1).max(120),
      amount: money,
      category: z.enum(ALL_PFC_CATEGORIES),
      date: isoDate,
    }),
  }),
]);

// The parts add up to the deposit. `replace` changes an answer already given.
export const depositAnswerSchema = z.object({ parts: z.array(partSchema).min(1).max(6), replace: z.boolean().optional() });

export type DepositAnswerInput = z.infer<typeof depositAnswerSchema>;
type PartInput = DepositAnswerInput["parts"][number];

type Result = { ok: true; message: string } | { ok: false; status: number; error: string };

const cents = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

async function readReviews(admin: AdminClient) {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", DEPOSIT_REVIEWS_KEY).maybeSingle();
  return { reviews: resolveDepositReviews(data?.value), error };
}

async function writeReviews(admin: AdminClient, reviews: Record<string, DepositReview>) {
  return (await admin.from("ui_preferences").upsert({ key: DEPOSIT_REVIEWS_KEY, value: reviews }, { onConflict: "key" })).error;
}

/** Sets only the category on a bank transaction's edits, leaving a rename, note or paid-back amount as it is. */
async function setCategory(admin: AdminClient, id: string, category: string | null) {
  const { error } = await admin.from("transaction_overrides").upsert({ transaction_id: id, category }, { onConflict: "transaction_id" });
  if (error || category !== null) return error;
  return removeEmptyOverride(admin, id);
}

// A row with nothing left on it would still mark the transaction as edited.
async function removeEmptyOverride(admin: AdminClient, id: string) {
  return (
    await admin
      .from("transaction_overrides")
      .delete()
      .eq("transaction_id", id)
      .is("category", null)
      .is("merchant_name", null)
      .is("notes", null)
      .is("reimbursed_amount", null)
  ).error;
}

/** A charge's amount, how much of it was paid back already, and its name. */
async function readCharge(admin: AdminClient, charge: { id: string; manual: boolean }) {
  if (charge.manual) {
    const { data } = await admin.from("manual_transactions").select("amount, reimbursed_amount, name").eq("id", charge.id).maybeSingle();
    return data ? { amount: Number(data.amount), paid: Number(data.reimbursed_amount ?? 0), label: data.name as string } : null;
  }
  const [{ data: tx }, { data: override }] = await Promise.all([
    admin.from("transactions").select("amount, name, merchant_name").eq("id", charge.id).maybeSingle(),
    admin.from("transaction_overrides").select("reimbursed_amount, merchant_name").eq("transaction_id", charge.id).maybeSingle(),
  ]);
  if (!tx) return null;
  const label =
    (override?.merchant_name as string | null) ||
    humanizeTransactionName({ name: tx.name as string | null, merchant_name: tx.merchant_name as string | null, amount: Number(tx.amount) });
  return { amount: Number(tx.amount), paid: Number(override?.reimbursed_amount ?? 0), label };
}

async function writePaidBack(admin: AdminClient, charge: { id: string; manual: boolean }, paid: number) {
  const amount = paid > 0.005 ? cents(paid) : null;
  if (charge.manual) return (await admin.from("manual_transactions").update({ reimbursed_amount: amount }).eq("id", charge.id)).error;
  const { error } = await admin.from("transaction_overrides").upsert({ transaction_id: charge.id, reimbursed_amount: amount }, { onConflict: "transaction_id" });
  if (error || amount !== null) return error;
  return removeEmptyOverride(admin, charge.id);
}

type Deposit = { date: string; name: string | null; merchant_name: string | null };

/** Does what one part says, returning what was done (for undo) or why it couldn't be. */
async function applyPart(admin: AdminClient, deposit: Deposit, input: PartInput): Promise<ReviewPart | { error: string; status: number }> {
  const amount = cents(input.amount);
  if (input.answer === "income") return { answer: "income", amount };
  if (input.answer === "own-money") {
    if (input.from === "account") return { answer: "own-money", amount, from: "account" };
    await adjustCashAsset(admin, -amount, deposit.date);
    return { answer: "own-money", amount, from: "cash", cashDelta: -amount };
  }
  if (input.answer === "paid-back") {
    const charge = await readCharge(admin, input.charge);
    if (!charge || charge.amount <= 0) return { status: 404, error: "Charge not found" };
    const paid = Math.min(charge.amount, cents(charge.paid + amount));
    const applied = cents(paid - charge.paid);
    if (applied <= 0) return { status: 400, error: `${charge.label} is already paid back in full` };
    const error = await writePaidBack(admin, input.charge, paid);
    if (error) {
      console.error("Failed to record a deposit as paid back", error);
      return { status: 500, error: "Couldn't save your answer" };
    }
    return { answer: "paid-back", amount, label: charge.label, charge: { ...input.charge, applied } };
  }
  const p = input.purchase;
  const paidBack = Math.min(cents(p.amount), amount);
  const from = humanizeTransactionName({ name: deposit.name, merchant_name: deposit.merchant_name, amount: -amount });
  const { data: created, error } = await admin
    .from("manual_transactions")
    .insert({
      date: p.date,
      name: p.name,
      amount: cents(p.amount),
      pfc_primary: p.category,
      payment_method: "Cash",
      notes: `Paid back ${usd(paidBack)} by ${from}`,
      reimbursed_amount: paidBack,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("Failed to record the cash purchase a deposit paid back", error);
    return { status: 500, error: "Couldn't save your answer" };
  }
  await adjustCashAsset(admin, -cents(p.amount), p.date);
  return { answer: "paid-back-cash", amount, label: p.name, purchaseId: created.id as string };
}

/** Puts back what one part did. */
async function undoPart(admin: AdminClient, part: ReviewPart, depositDate: string | null) {
  if (part.charge) {
    const charge = await readCharge(admin, part.charge);
    if (charge) await writePaidBack(admin, part.charge, Math.max(0, cents(charge.paid - part.charge.applied)));
  }
  if (part.purchaseId) {
    const { data: purchase } = await admin.from("manual_transactions").select("amount, date").eq("id", part.purchaseId).maybeSingle();
    if (purchase) {
      await admin.from("manual_transactions").delete().eq("id", part.purchaseId);
      await adjustCashAsset(admin, Number(purchase.amount), purchase.date as string);
    }
  }
  if (part.cashDelta) await adjustCashAsset(admin, -part.cashDelta, depositDate);
}

function messageFor(parts: ReviewPart[]): string {
  if (parts.length > 1) return `Split into ${parts.length} parts`;
  const [p] = parts;
  switch (p.answer) {
    case "income":
      return `${usd(p.amount)} counted as income`;
    case "own-money":
      return p.from === "cash" ? `${usd(p.amount)} came from your cash` : "Counted as your own money moving";
    case "paid-back":
      return `${usd(p.charge!.applied)} comes off ${p.label ?? "that charge"}`;
    case "paid-back-cash":
      return `${p.label} added as a cash purchase, ${usd(p.amount)} of it paid back`;
  }
}

/**
 * Records what a deposit was, in one part or several that add up to it.
 * Income counts as income (only its part, when split); money paid back
 * comes off the charge it paid for (or a cash purchase recorded now); your
 * own money is a transfer, and cash you deposited or handed over for it
 * comes out of Cash. The deposit itself is never changed, only how it's
 * counted. With `replace`, the answer already given is undone first.
 */
export async function answerDeposit(admin: AdminClient, id: string, input: DepositAnswerInput): Promise<Result> {
  const { data: deposit } = await admin.from("transactions").select("id, date, amount, name, merchant_name").eq("id", id).maybeSingle();
  if (!deposit || Number(deposit.amount) >= 0) return { ok: false, status: 404, error: "Deposit not found" };
  const amount = cents(-Number(deposit.amount));
  const total = cents(input.parts.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(total - amount) > 0.005) return { ok: false, status: 400, error: `The parts add up to ${usd(total)}, not ${usd(amount)}` };

  let { reviews, error: readError } = await readReviews(admin);
  if (readError) return { ok: false, status: 500, error: "Couldn't save your answer" };
  if (reviews[id]) {
    if (!input.replace) return { ok: false, status: 409, error: "This deposit was already answered" };
    const undone = await undoDepositAnswer(admin, id);
    if (!undone.ok) return undone;
    ({ reviews, error: readError } = await readReviews(admin));
    if (readError) return { ok: false, status: 500, error: "Couldn't save your answer" };
  }

  const { data: override } = await admin.from("transaction_overrides").select("category").eq("transaction_id", id).maybeSingle();
  const source: Deposit = { date: deposit.date as string, name: deposit.name as string | null, merchant_name: deposit.merchant_name as string | null };
  const parts: ReviewPart[] = [];
  for (const input_ of input.parts) {
    const done = await applyPart(admin, source, input_);
    if ("error" in done) {
      // Leave nothing half done.
      for (const p of parts.reverse()) await undoPart(admin, p, source.date);
      return { ok: false, status: done.status, error: done.error };
    }
    parts.push(done);
  }

  const review: DepositReview = {
    amount,
    at: new Date().toISOString(),
    previousCategory: (override?.category as string | null) ?? null,
    parts,
  };
  const categoryError = await setCategory(admin, id, parts.some((p) => p.answer === "income") ? "INCOME" : "TRANSFER_IN");
  if (categoryError) console.error("Failed to set a reviewed deposit's category", categoryError);
  const writeError = await writeReviews(admin, { ...reviews, [id]: review });
  if (writeError) {
    console.error("Failed to save a deposit review", writeError);
    return { ok: false, status: 500, error: "Couldn't save your answer" };
  }
  return { ok: true, message: messageFor(parts) };
}

/** Takes an answer back: everything it changed goes back to how it was, and the deposit is asked about again. */
export async function undoDepositAnswer(admin: AdminClient, id: string): Promise<Result> {
  const { reviews, error: readError } = await readReviews(admin);
  if (readError) return { ok: false, status: 500, error: "Couldn't undo" };
  const review = reviews[id];
  if (!review) return { ok: false, status: 404, error: "Nothing to undo" };

  const { data: deposit } = await admin.from("transactions").select("date").eq("id", id).maybeSingle();
  for (const part of [...review.parts].reverse()) await undoPart(admin, part, (deposit?.date as string | undefined) ?? null);
  const categoryError = await setCategory(admin, id, review.previousCategory);
  if (categoryError) console.error("Failed to restore a deposit's category", categoryError);

  const rest = { ...reviews };
  delete rest[id];
  const writeError = await writeReviews(admin, rest);
  if (writeError) {
    console.error("Failed to remove a deposit review", writeError);
    return { ok: false, status: 500, error: "Couldn't undo" };
  }
  return { ok: true, message: "Undone" };
}
