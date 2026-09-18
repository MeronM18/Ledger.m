import "server-only";
import { createHash, createPublicKey, timingSafeEqual, verify as cryptoVerify } from "crypto";
import type { JWKPublicKey } from "plaid";
import { plaidClient } from "@/lib/plaid";

// Plaid webhook verification, per https://plaid.com/docs/api/webhooks/webhook-verification/
// The `Plaid-Verification` header is a JWT (ES256) whose payload commits to a
// sha256 hash of the raw request body and an `iat` no more than 5 minutes old.
// The public key is fetched by `kid` from /webhook_verification_key/get and
// cached in memory (keys rotate rarely; Plaid's own examples cache them too).

const MAX_CLOCK_DRIFT_SECONDS = 5 * 60;
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedKey = { key: JWKPublicKey; fetchedAt: number };
const keyCache = new Map<string, CachedKey>();

function base64UrlDecode(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

async function getVerificationKey(keyId: string): Promise<JWKPublicKey> {
  const cached = keyCache.get(keyId);
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
    return cached.key;
  }

  const response = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  const key = response.data.key;
  keyCache.set(keyId, { key, fetchedAt: Date.now() });
  return key;
}

export type WebhookVerificationResult =
  | { verified: true }
  | { verified: false; reason: string };

/**
 * `rawBody` must be the exact, unmodified request body text (read via
 * request.text() before any JSON.parse) — the signed hash is sensitive to
 * whitespace, so re-serializing the parsed JSON would break verification.
 */
export async function verifyPlaidWebhook(
  rawBody: string,
  verificationHeader: string | null
): Promise<WebhookVerificationResult> {
  if (!verificationHeader) {
    return { verified: false, reason: "Missing Plaid-Verification header" };
  }

  const parts = verificationHeader.split(".");
  if (parts.length !== 3) {
    return { verified: false, reason: "Malformed JWT" };
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: { iat?: number; request_body_sha256?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return { verified: false, reason: "Unable to parse JWT" };
  }

  if (header.alg !== "ES256") {
    return { verified: false, reason: `Unexpected alg: ${header.alg}` };
  }
  if (!header.kid) {
    return { verified: false, reason: "Missing kid in JWT header" };
  }

  let jwk: JWKPublicKey;
  try {
    jwk = await getVerificationKey(header.kid);
  } catch (err) {
    return {
      verified: false,
      reason: `Failed to fetch verification key: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (jwk.expired_at !== null && jwk.expired_at * 1000 < Date.now()) {
    return { verified: false, reason: "Verification key is expired" };
  }

  let signatureValid: boolean;
  try {
    const publicKey = createPublicKey({
      key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      format: "jwk",
    });
    const signedData = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
    const signature = base64UrlDecode(signatureB64);
    signatureValid = cryptoVerify(
      "sha256",
      signedData,
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature
    );
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return { verified: false, reason: "Invalid signature" };
  }

  if (typeof payload.iat !== "number") {
    return { verified: false, reason: "Missing iat claim" };
  }
  const ageSeconds = Date.now() / 1000 - payload.iat;
  if (Math.abs(ageSeconds) > MAX_CLOCK_DRIFT_SECONDS) {
    return { verified: false, reason: "Webhook timestamp outside allowed window" };
  }

  if (!payload.request_body_sha256) {
    return { verified: false, reason: "Missing request_body_sha256 claim" };
  }

  const actualHash = createHash("sha256").update(rawBody, "utf8").digest();
  const expectedHash = Buffer.from(payload.request_body_sha256, "hex");

  if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) {
    return { verified: false, reason: "Body hash mismatch" };
  }

  return { verified: true };
}
