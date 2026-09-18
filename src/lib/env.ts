import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  PLAID_CLIENT_ID: z.string().min(1, "PLAID_CLIENT_ID is required"),
  PLAID_SECRET: z.string().min(1, "PLAID_SECRET is required"),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PLAID_PRODUCTS: z.string().min(1).default("transactions"),
  PLAID_COUNTRY_CODES: z.string().min(1).default("US"),
  PLAID_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  ALLOWED_EMAIL: z
    .string()
    .min(1, "ALLOWED_EMAIL is required")
    .refine((v) => v.includes("@"), "ALLOWED_EMAIL must be a valid email"),

  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, "TOKEN_ENCRYPTION_KEY is required")
    .refine((v) => {
      try {
        return Buffer.from(v, "base64").length === 32;
      } catch {
        return false;
      }
    }, "TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key"),

  NTFY_TOPIC: z.string().min(1, "NTFY_TOPIC is required"),
  NTFY_SERVER: z.string().url().default("https://ntfy.sh"),

  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

function loadServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables. Check .env.local against .env.local.example:\n${issues}`
    );
  }

  return parsed.data;
}

export const env = loadServerEnv();
