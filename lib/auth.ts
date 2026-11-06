import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "./errors";

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export type AuthEnv = {
  sharedSecret?: string;
  apiKey?: string;
};

export function authorizeRequest(
  headers: Headers,
  rawBody: string,
  env: AuthEnv,
  now = Date.now(),
): void {
  const signature = headers.get("x-retell-signature");
  if (env.apiKey && signature) {
    if (!verifyRetellSignature(rawBody, env.apiKey, signature, now)) {
      throw new UnauthorizedError("Invalid Retell signature.");
    }
  }

  if (!env.sharedSecret) return;
  const presented = headers.get("x-api-key") ?? "";
  if (!safeEqual(presented, env.sharedSecret)) {
    throw new UnauthorizedError("Missing or invalid x-api-key.");
  }
}

export function verifyRetellSignature(
  rawBody: string,
  apiKey: string,
  signature: string,
  now = Date.now(),
): boolean {
  const match = signature.match(/^v=(\d+),d=([0-9a-f]+)$/i);
  if (!match) return false;
  const timestamp = Number(match[1]);
  const digest = match[2].toLowerCase();
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > SIGNATURE_WINDOW_MS) {
    return false;
  }
  const expected = createHmac("sha256", apiKey).update(`${rawBody}${timestamp}`).digest("hex");
  return safeEqual(digest, expected);
}

export function signRetellBody(rawBody: string, apiKey: string, timestamp = Date.now()): string {
  const digest = createHmac("sha256", apiKey).update(`${rawBody}${timestamp}`).digest("hex");
  return `v=${timestamp},d=${digest}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function authEnvFromProcess(): AuthEnv {
  return {
    sharedSecret: process.env.RETELL_SHARED_SECRET || undefined,
    apiKey: process.env.RETELL_API_KEY || undefined,
  };
}
