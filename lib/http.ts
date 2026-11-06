import { UpstreamError } from "./errors";

export const USER_AGENT =
  "RiftHerald/1.0 (League of Legends voice assistant; +https://github.com/akRetell/rift-herald-api)";

export const REVALIDATE_SECONDS = 60 * 60;

export async function fetchText(
  url: string,
  userAgent = USER_AGENT,
  timeoutMs = 12_000,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": userAgent,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    throw new UpstreamError(`Could not reach ${hostOf(url)} (${message}).`);
  }
  if (!response.ok) {
    throw new UpstreamError(`${hostOf(url)} responded ${response.status}.`);
  }
  return response.text();
}

export async function fetchJson<T>(
  url: string,
  userAgent = USER_AGENT,
  timeoutMs = 12_000,
): Promise<T> {
  const text = await fetchText(url, userAgent, timeoutMs);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`${hostOf(url)} returned a response that was not JSON.`);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
