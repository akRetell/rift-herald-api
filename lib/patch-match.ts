import { readNextData, textContent } from "./html";

export type ArticleCard = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string;
  key: string | null;
  display: string | null;
};

const TITLE_PATCH =
  /patch\s+((?:20)?\d{2}\.s\d+\.\d+[a-z]?|\d{1,4}\.\d{1,2}[a-z]?)/i;

/**
 * Comparable patch id. Hotfix builds (16.22.1) collapse to major.minor.
 * Season ids (25.S1.1, 2025.S1.3) stay three-part. Leading zeros are stripped
 * so 25.09 and 25.9 compare equal.
 */
export function normalizePatchKey(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^patch\s+/, "").replace(/\s+/g, "").replace(/^v/, "");
  value = value.replace(/^20(\d\d)\./, "$1.");

  const season = value.match(/^(\d+)\.s(\d+)\.(\d+)([a-z])?$/);
  if (season) {
    return `${Number(season[1])}.s${Number(season[2])}.${Number(season[3])}${season[4] ?? ""}`;
  }

  const numeric = value.match(/^(\d+)\.(\d+)(?:\.(\d+))?([a-z])?$/);
  if (!numeric) return null;
  return `${Number(numeric[1])}.${Number(numeric[2])}${numeric[4] ?? ""}`;
}

/**
 * Preference-ordered keys to look up in the news index.
 *
 * Data Dragon kept counting 15, 16, … after the public notes switched to the
 * calendar year (15.22 is the article titled 25.22, 16.22.1 is 26.22). Early
 * 2025 notes used a season id: Data Dragon 15.1, 15.2, and 15.3 are
 * 25.S1.1, 25.S1.2, and 2025.S1.3. The exact key is always tried first.
 */
export function candidateKeys(input: string): string[] {
  const key = normalizePatchKey(input);
  if (!key) return [];
  const keys = [key];
  const add = (candidate: string) => {
    if (!keys.includes(candidate)) keys.push(candidate);
  };

  const numeric = key.match(/^(\d+)\.(\d+)([a-z])?$/);
  if (!numeric) return keys;
  const major = Number(numeric[1]);
  const minor = Number(numeric[2]);
  const letter = numeric[3] ?? "";

  if (!letter && major === 15 && minor >= 1 && minor <= 3) {
    add(`25.s1.${minor}`);
  }
  if (major >= 15 && major < 25) {
    add(`${major + 10}.${minor}${letter}`);
  }
  if (!letter && major === 25 && minor >= 1 && minor <= 3) {
    add(`25.s1.${minor}`);
  }
  return keys;
}

export function parseTitlePatch(title: string): { key: string; display: string } | null {
  const match = title.match(TITLE_PATCH);
  if (!match?.[1]) return null;
  const display = match[1];
  const key = normalizePatchKey(display);
  if (!key) return null;
  return { key, display };
}

export function absoluteArticleUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `https://www.leagueoflegends.com${path.replace(/\/$/, "")}/`;
}

export function extractArticleCards(html: string): ArticleCard[] {
  const data = readNextData(html);
  const fromJson = data ? cardsFromNextData(data) : [];
  if (fromJson.length > 0) return fromJson;
  return cardsFromAnchors(html);
}

export function findArticle(cards: ArticleCard[], requested: string): ArticleCard | null {
  const keys = candidateKeys(requested);
  for (const key of keys) {
    const hits = cards.filter((card) => card.key === key);
    if (hits.length === 0) continue;
    hits.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return hits[0];
  }
  return null;
}

function cardsFromNextData(data: unknown): ArticleCard[] {
  const blades = readPath(data, ["props", "pageProps", "page", "blades"]);
  if (!Array.isArray(blades)) return [];
  const cards: ArticleCard[] = [];
  for (const blade of blades) {
    if (!blade || typeof blade !== "object") continue;
    const items = (blade as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const card = cardFromItem(item);
      if (card) cards.push(card);
    }
  }
  return cards;
}

function cardFromItem(item: unknown): ArticleCard | null {
  if (!item || typeof item !== "object") return null;
  const record = item as {
    title?: unknown;
    publishedAt?: unknown;
    description?: unknown;
    action?: { payload?: { url?: unknown } };
  };
  if (typeof record.title !== "string") return null;
  const url = record.action?.payload?.url;
  if (typeof url !== "string" || url.length === 0) return null;
  const parsed = parseTitlePatch(record.title);
  return {
    title: record.title,
    url,
    description: descriptionText(record.description),
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : undefined,
    key: parsed?.key ?? null,
    display: parsed?.display ?? null,
  };
}

function descriptionText(description: unknown): string {
  if (typeof description === "string") return textContent(description);
  if (description && typeof description === "object" && "body" in description) {
    const body = (description as { body?: unknown }).body;
    return typeof body === "string" ? textContent(body) : "";
  }
  return "";
}

function cardsFromAnchors(html: string): ArticleCard[] {
  const cards: ArticleCard[] = [];
  const pattern =
    /aria-label="([^"]*patch[^"]*)"[^>]*href="([^"]+)"|href="([^"]*patch[^"]*notes[^"]*)"[^>]*aria-label="([^"]+)"/gi;
  for (const match of html.matchAll(pattern)) {
    const title = match[1] || match[4] || "";
    const url = match[2] || match[3] || "";
    if (!title || !url) continue;
    const parsed = parseTitlePatch(title);
    cards.push({
      title,
      url,
      description: "",
      key: parsed?.key ?? null,
      display: parsed?.display ?? null,
    });
  }
  return cards;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function extractArticleBody(html: string): {
  title: string;
  description: string;
  bodyHtml: string;
} {
  const data = readNextData(html);
  const page = readPath(data, ["props", "pageProps", "page"]);
  if (!page || typeof page !== "object") {
    return { title: "", description: "", bodyHtml: "" };
  }
  const record = page as {
    title?: unknown;
    description?: unknown;
    blades?: unknown;
  };
  const title = typeof record.title === "string" ? record.title : "";
  const description = descriptionText(record.description);
  const blades = Array.isArray(record.blades) ? record.blades : [];
  let bodyHtml = "";
  for (const blade of blades) {
    if (!blade || typeof blade !== "object") continue;
    const rich = (blade as { richText?: { body?: unknown } }).richText;
    if (typeof rich?.body === "string" && rich.body.includes("<")) {
      bodyHtml = rich.body;
      break;
    }
  }
  return { title, description, bodyHtml };
}
