const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  gt: ">",
  hellip: "...",
  ldquo: '"',
  lsquo: "'",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rArr: "⇒",
  rarr: "→",
  rdquo: '"',
  rsquo: "'",
  times: "×",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

export function textContent(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([:;,])/g, "$1")
    .trim();
}

export function attr(tagAttrs: string, name: string): string {
  const match = tagAttrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match?.[2] ?? match?.[3] ?? "";
}

export function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 3);
  const wordBoundary = sliced.lastIndexOf(" ");
  const base = wordBoundary > max * 0.6 ? sliced.slice(0, wordBoundary) : sliced;
  return `${base.trim()}...`;
}

export function firstSentence(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [clean];
  const useful = sentences.find((sentence) => sentence.length >= 40) ?? sentences[0] ?? clean;
  return useful.length <= max ? useful : shorten(useful, max);
}

export type Heading = {
  level: number;
  title: string;
  className: string;
  tagStart: number;
  contentStart: number;
};

export function parseHeadings(html: string): Heading[] {
  const pattern = /<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const headings: Heading[] = [];
  for (const match of html.matchAll(pattern)) {
    const tag = match[0];
    const index = match.index ?? 0;
    headings.push({
      level: Number(match[1]),
      className: attr(match[2] ?? "", "class"),
      title: textContent(match[3] ?? ""),
      tagStart: index,
      contentStart: index + tag.length,
    });
  }
  return headings;
}

export function readNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}
