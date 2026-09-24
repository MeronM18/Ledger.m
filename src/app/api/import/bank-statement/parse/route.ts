import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { pdfPages } from "@/lib/pdf-text";
import { parseStatement, StatementParseError } from "@/lib/statement-import";

const MAX_BYTES = 4 * 1024 * 1024;

/** Reads one statement PDF and returns its transactions and checks. Saves nothing. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was sent" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too large for a statement" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "That isn't a PDF" }, { status: 400 });
  }

  try {
    return NextResponse.json({ statement: parseStatement(await pdfPages(bytes)) });
  } catch (err) {
    if (err instanceof StatementParseError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("Failed to read statement PDF", err);
    return NextResponse.json({ error: "Couldn't read that PDF" }, { status: 422 });
  }
}
