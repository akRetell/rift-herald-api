import { BadRequestError } from "./errors";

export async function readJsonBody(request: Request): Promise<{ raw: string; json: unknown }> {
  const raw = await request.text();
  if (!raw.trim()) return { raw, json: {} };
  try {
    return { raw, json: JSON.parse(raw) as unknown };
  } catch {
    throw new BadRequestError("Request body must be JSON.");
  }
}

/**
 * Retell custom functions send `{ name, call, args }` unless "Payload: args only"
 * is enabled, in which case the arguments sit at the top level. Accept both.
 */
export function unwrapArgs(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const record = body as Record<string, unknown>;
  let nested: unknown = record.args;
  if (typeof nested === "string") {
    try {
      nested = JSON.parse(nested) as unknown;
    } catch {
      nested = undefined;
    }
  }
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...record, ...(nested as Record<string, unknown>) };
  }
  return record;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
