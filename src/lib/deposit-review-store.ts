import "server-only";
import { z } from "zod";
import { adjustCashAsset } from "@/lib/cash-asset-sync";
import { resolveDepositReviews, type DepositReview } from "@/lib/deposit-review";
import { ALL_PFC_CATEGORIES } from "@/lib/plaid-categories";
import type { createAdminClient } from "@/lib/supabase/admin";
import { humanizeTransactionName } from "@/lib/transaction-display";
import { DEPOSIT_REVIEWS_KEY } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const depositAnswerSchema = z.discriminatedUnion("answer", [
  z.object({ answer: z.literal("income") }),
  z.object({ answer: z.literal("own-money"), from: z.enum(["cash", "account"]) }),
  z.object({ answer: z.literal("paid-back"), charge: z.object({ id: z.string().min(1), manual: z.boolean() }) }),
  z.object({
    answer: z.literal("paid-back-cash"),
    purchase: z.object({
      name: z.string().trim().min(1).max(120),
      amount: z.number().positive().max(10_000_000),
      category: z.enum(ALL_PFC_CATEGORIES),
      date: isoDate,
    }),
  }),
]);

export type DepositAnswerInput = z.infer<typeof depositAnswerSchema>;

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

/** A charge's amount and how much of it was paid back already. */
async function readCharge(admin: AdminClient, charge: { id: string; manual: boolean }) {
  if (charge.manual) {
    const { data } = await admin.from("manual_transactions").select("amount, reimbursed_amount").eq("id", charge.id).maybeSingle();
    return data ? { amount: Number(data.amount), paid: Number(data.reimbursed_amount ?? 0) } : null;
  }
  const [{ data: tx }, { data: override }] = await Promise.all([
    admin.from("transactions").select("amount").eq("id", charge.id).maybeSingle(),
    admin.from("transaction_overrides").select("reimbursed_amount").eq("transaction_id", charge.id).maybeSingle(),
  ]);
  return tx ? { amount: Number(tx.amount), paid: Number(override?.reimbursed_amount ?? 0) } : null;
}

async function writePaidBack(admin: AdminClient, charge: { id: string; manual: boolean }, paid: number) {
  const amount = paid > 0.005 ? cents(paid) : null;
  if (charge.manual) return (await admin.from("manual_transactions").update({ reimbursed_amount: amount }).eq("id", charge.id)).error;
  const { error } = await admin.from("transaction_overrides").upsert({ transaction_id: charge.id, reimbursed_amount: amount }, { onConflict: "transaction_id" });
  if (error || amount !== null) return error;
  return removeEmptyOverride(admin, charge.id);
}

/**
 * Records what a deposit was. Income counts as income; money paid back
 * comes off the charge it paid for (or a cash purchase recorded now); your
 * own money is a transfer, and cash you deposited comes out of Cash. The
 * deposit itself is never changed, only how it's counted.
 */
export async function answerDeposit(admin: AdminClient, id: string, input: DepositAnswerInput): Promise<Result> {
  const [{ data: deposit }, { reviews, error: readError }, { data: override }] = await Promise.all([
    admin.from("transactions").select("id, date, amount, name, merchant_name, pending").eq("id", id).maybeSingle(),
    readReviews(admin),
    admin.from("transaction_overrides").select("category").eq("transaction_id", id).maybeSingle(),
  ]);
  if (!deposit || Number(deposit.amount) >= 0) return { ok: false, status: 404, error: "Deposit not found" };
  if (readError) return { ok: false, status: 500, error: "Couldn't save your answer" };
  if (reviews[id]) return { ok: false, status: 409, error: "This deposit was already answered" };

  const amount = cents(-Number(deposit.amount));
  const date = deposit.date as string;
  const review: DepositReview = {
    answer: input.answer,
    amount,
    at: new Date().toISOString(),
    previousCategory: (override?.category as string | null) ?? null,
  };
  let message = "";

  if (input.answer === "income") {
    message = `${usd(amount)} counted as income`;
  } else if (input.answer === "own-money") {
    if (input.from === "cash") {
      await adjustCashAsset(admin, -amount, date);
      review.cashDelta = -amount;
      message = `${usd(amount)} moved from your cash to the bank`;
    } else {
      message = "Counted as your own money moving";
    }
  } else if (input.answer === "paid-back") {
    const charge = await readCharge(admin, input.charge);
    if (!charge || charge.amount <= 0) return { ok: false, status: 404, error: "Charge not found" };
    const paid = Math.min(charge.amount, cents(charge.paid + amount));
    const applied = cents(paid - charge.paid);
    if (applied <= 0) return { ok: false, status: 400, error: "That charge is already paid back in full" };
    const error = await writePaidBack(admin, input.charge, paid);
    if (error) {
      console.error("Failed to record a deposit as paid back", error);
      return { ok: false, status: 500, error: "Couldn't save your answer" };
    }
    review.charge = { ...input.charge, applied };
    message = `${usd(applied)} comes off that charge`;
  } else {
    const p = input.purchase;
    const paidBack = Math.min(cents(p.amount), amount);
    const { data: created, error } = await admin
      .from("manual_transactions")
      .insert({
        date: p.date,
        name: p.name,
        amount: cents(p.amount),
        pfc_primary: p.category,
        payment_method: "Cash",
        notes: `Paid back ${usd(paidBack)} by ${humanizeTransactionName({ name: deposit.name as string | null, merchant_name: deposit.merchant_name as string | null, amount: -amount })}`,
        reimbursed_amount: paidBack,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("Failed to record the cash purchase a deposit paid back", error);
      return { ok: false, status: 500, error: "Couldn't save your answer" };
    }
    await adjustCashAsset(admin, -cents(p.amount), p.date);
    review.purchaseId = created.id as string;
    message = `${p.name} added as a cash purchase, ${usd(paidBack)} of it paid back`;
  }

  const categoryError = await setCategory(admin, id, input.answer === "income" ? "INCOME" : "TRANSFER_IN");
  if (categoryError) console.error("Failed to set a reviewed deposit's category", categoryError);
  const writeError = await writeReviews(admin, { ...reviews, [id]: review });
  if (writeError) {
    console.error("Failed to save a deposit review", writeError);
    return { ok: false, status: 500, error: "Couldn't save your answer" };
  }
  return { ok: true, message };
}

/** Takes an answer back: everything it changed goes back to how it was, and the deposit is asked about again. */
export async function undoDepositAnswer(admin: AdminClient, id: string): Promise<Result> {
  const { reviews, error: readError } = await readReviews(admin);
  if (readError) return { ok: false, status: 500, error: "Couldn't undo" };
  const review = reviews[id];
  if (!review) return { ok: false, status: 404, error: "Nothing to undo" };

  if (review.charge) {
    const charge = await readCharge(admin, review.charge);
    if (charge) await writePaidBack(admin, review.charge, Math.max(0, cents(charge.paid - review.charge.applied)));
  }
  if (review.purchaseId) {
    const { data: purchase } = await admin.from("manual_transactions").select("amount, date").eq("id", review.purchaseId).maybeSingle();
    if (purchase) {
      await admin.from("manual_transactions").delete().eq("id", review.purchaseId);
      await adjustCashAsset(admin, Number(purchase.amount), purchase.date as string);
    }
  }
  if (review.cashDelta) {
    const { data: deposit } = await admin.from("transactions").select("date").eq("id", id).maybeSingle();
    await adjustCashAsset(admin, -review.cashDelta, (deposit?.date as string | undefined) ?? null);
  }
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
