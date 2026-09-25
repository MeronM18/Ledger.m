import "server-only";
import { env } from "@/lib/env";

const APP_NAME = "Ledger.m";

// The production address Vercel provides (no scheme), or none locally.
function siteOrigin(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : null;
}

/**
 * `subtitle` is the part after the app name, e.g. sendNotification("$14.99 at
 * Netflix", ...) produces the ntfy title "Ledger.m · $14.99 at Netflix".
 *
 * Uses ntfy's JSON publish format (rather than the Title/X-Title header)
 * since header values aren't reliably UTF-8-safe across clients, and the
 * title includes a non-ASCII middle dot.
 */
export async function sendNotification(subtitle: string, body: string, href?: string): Promise<void> {
  const response = await fetch(env.NTFY_SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: env.NTFY_TOPIC,
      title: `${APP_NAME} · ${subtitle}`,
      message: body,
      // Tapping the push opens this page, when the site's address is known.
      ...(href && siteOrigin() ? { click: new URL(href, siteOrigin()!).toString() } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`ntfy notification failed: ${response.status} ${await response.text()}`);
  }
}
