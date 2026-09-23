// Pure, dependency-free. Reads the CSV Apple's Wallet app exports for Apple
// Card and turns each row into a transaction in the shape the rest of the
// app already uses (Plaid's sign convention: positive = money out).

export type ImportedTransaction = {
  date: string; // YYYY-MM-DD, the day it was made
  name: string;
  amount: number; // purchases positive; payments, refunds and credits negative
  pfc_primary: string;
  notes: string | null;
  external_id: string;
};

export type ImportResult = {
  transactions: ImportedTransaction[];
  skipped: { line: number; reason: string }[];
};

/** RFC 4180-style CSV: quoted fields, doubled quotes, and either kind of newline. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** MM/DD/YYYY to YYYY-MM-DD, or null if it isn't a real date. */
export function parseUsDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Apple's own category names, mapped onto the app's fixed category list.
const APPLE_CATEGORY: Record<string, string> = {
  restaurants: "FOOD_AND_DRINK",
  grocery: "FOOD_AND_DRINK",
  gas: "TRANSPORTATION",
  transportation: "TRANSPORTATION",
  entertainment: "ENTERTAINMENT",
  shopping: "GENERAL_MERCHANDISE",
  airlines: "TRAVEL",
  travel: "TRAVEL",
  hotels: "TRAVEL",
  "govt-services-parking": "GOVERNMENT_AND_NON_PROFIT",
  health: "MEDICAL",
  medical: "MEDICAL",
};

// Apple files a lot under "Other", so the merchant decides those.
const MERCHANT_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /apple\.com\/bill|apple services|itunes|icloud|google|instant ink|supabase|docusign|twilio|higgsfield|amazon prime|whop|wepa|hinge|openai|netflix|spotify|hulu|disney/i, category: "GENERAL_SERVICES" },
  { pattern: /cvs|walgreens|pharmacy/i, category: "MEDICAL" },
  { pattern: /air can|airline|delta air|united air|marriott|hotel|airbnb|clip mx/i, category: "TRAVEL" },
  { pattern: /barber|salon|spa\b/i, category: "PERSONAL_CARE" },
  { pattern: /amazon|apple store|dollar tree|costco|groupon|ups store|tiktok|walmart|target|best buy/i, category: "GENERAL_MERCHANDISE" },
];

/** "Utica Rng Ops Llc 21420 Hall Road ... (DISPUTE)" becomes "Utica Rng Ops Llc". */
export function cleanPayee(merchant: string, description: string): { name: string; tag: string | null } {
  const source = (merchant || description).trim();
  const tagMatch = description.match(/\((return|refund|dispute|reversal|credit)[^)]*\)\s*$/i) ?? source.match(/\((return|refund|dispute|reversal|credit)[^)]*\)\s*$/i);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : null;

  let name = source.replace(/\s*\((return|refund|dispute|reversal|credit)[^)]*\)\s*$/i, "");
  // Apple's own billing descriptor carries its head-office address.
  if (/^apple\.com\/bill/i.test(name)) name = "Apple Services";
  // Street addresses trail the name: cut at a house number followed by a word,
  // or at a street-type word after at least two words of name.
  name = name.replace(/\s+\d{1,6}\s+[A-Za-z].*$/, "");
  name = name.replace(/^(\S+\s+\S+.*?)\s+(Blvd|Ave|Avenue|Street|St|Rd|Road|Way|Hwy|Highway|Dr|Drive|Ln|Lane)\b.*$/i, "$1");
  // Reference numbers glued to the name ("Air Can0142320333107").
  name = name.replace(/(?<=[A-Za-z])\d{6,}\b.*$/, "");
  name = name.replace(/\s{2,}/g, " ").trim();
  if (name.length > 60) name = name.slice(0, 60).trim();
  return { name: name || source.slice(0, 60), tag };
}

const INSTALLMENT = /monthly installment|installment|apple card financing/i;

/**
 * The app category for one row. Payments to the card and Daily Cash
 * adjustments are money moving, not spending, so they land in the transfer
 * categories that every spending view already leaves out.
 */
export function categorize(row: { category: string; type: string; merchant: string; description: string; amount: number }): string {
  const text = `${row.merchant} ${row.description}`;
  if (/daily cash adjustment/i.test(text)) return "TRANSFER_OUT";
  if (row.type.toLowerCase() === "payment" || (row.category.toLowerCase() === "payment" && row.amount < 0)) return "TRANSFER_IN";

  const byApple = APPLE_CATEGORY[row.category.trim().toLowerCase()];
  if (byApple) return byApple;

  for (const rule of MERCHANT_RULES) if (rule.pattern.test(text)) return rule.category;
  return "GENERAL_MERCHANDISE";
}

const REQUIRED = ["Transaction Date", "Description", "Type", "Amount (USD)"] as const;

export function parseAppleCardCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { transactions: [], skipped: [{ line: 1, reason: "The file is empty." }] };

  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const missing = REQUIRED.filter((c) => col(c) === -1);
  if (missing.length > 0) {
    return { transactions: [], skipped: [{ line: 1, reason: `This doesn't look like an Apple Card export. Missing: ${missing.join(", ")}.` }] };
  }

  const idx = {
    date: col("Transaction Date"),
    clearing: col("Clearing Date"),
    description: col("Description"),
    merchant: col("Merchant"),
    category: col("Category"),
    type: col("Type"),
    amount: col("Amount (USD)"),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const transactions: ImportedTransaction[] = [];
  const skipped: { line: number; reason: string }[] = [];
  // Identical rows on one day are real (three $2.99 charges), so each gets a
  // running number; the same statement imported twice then produces the same ids.
  const seen = new Map<string, number>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const date = parseUsDate(get(r, idx.date));
    const amount = Number(get(r, idx.amount).replace(/,/g, ""));
    if (!date) return void skipped.push({ line, reason: "Unreadable transaction date." });
    if (!Number.isFinite(amount) || get(r, idx.amount) === "") return void skipped.push({ line, reason: "Unreadable amount." });

    const description = get(r, idx.description);
    const merchant = get(r, idx.merchant);
    const type = get(r, idx.type);
    const category = get(r, idx.category);

    const pfc = categorize({ category, type, merchant, description, amount });
    const { name, tag } = cleanPayee(merchant, description);
    const notes = [
      tag ? tag.charAt(0).toUpperCase() + tag.slice(1) : null,
      INSTALLMENT.test(`${merchant} ${description}`) ? "Apple Card Monthly Installment" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const base = [get(r, idx.date), get(r, idx.clearing), description, amount.toFixed(2)].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    transactions.push({
      date,
      name: pfc === "TRANSFER_IN" ? "Payment to Apple Card" : name,
      amount,
      pfc_primary: pfc,
      notes: notes || null,
      external_id: `${base}|${n}`,
    });
  });

  return { transactions, skipped };
}
