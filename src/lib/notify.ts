import "server-only";
import { env } from "@/lib/env";

export async function sendNotification(title: string, body: string): Promise<void> {
  const url = `${env.NTFY_SERVER.replace(/\/$/, "")}/${env.NTFY_TOPIC}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Title: title,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`ntfy notification failed: ${response.status} ${await response.text()}`);
  }
}
