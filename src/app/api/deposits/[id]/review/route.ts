import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { answerDeposit, depositAnswerSchema, undoDepositAnswer } from "@/lib/deposit-review-store";
import { createAdminClient } from "@/lib/supabase/admin";

/** What a deposit was: income, money paid back, or your own money. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = depositAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = await answerDeposit(createAdminClient(), id, parsed.data);
  return result.ok ? NextResponse.json({ ok: true, message: result.message }) : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Takes the answer back, so the deposit is asked about again. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await undoDepositAnswer(createAdminClient(), id);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
