import { firstSentence, parseHeadings, shorten, textContent, type Heading } from "./html";

export type PatchNotesSummary = {
  champion_buffs: string[];
  champion_nerfs: string[];
  system_changes: string[];
};

const CAP = 5;

type ChangeKind = "buff" | "nerf" | "adjust";

type ChangeLine = {
  name: string;
  line: string;
  index: number;
};

export function parsePatchNotes(html: string, intro = ""): PatchNotesSummary {
  const headings = parseHeadings(html);
  const opening = `${intro} ${textBefore(html, headings[0]?.tagStart ?? 0)}`.trim();
  const buffs: ChangeLine[] = [];
  const nerfs: ChangeLine[] = [];
  const adjustments: string[] = [];
  const systems: string[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading.level !== 2 || !heading.title) continue;
    const sectionHtml = sliceSection(html, headings, index, 2);
    if (isChampionSection(heading.title)) {
      collectChampions(sectionHtml, buffs, nerfs, adjustments);
      continue;
    }
    if (skipSection(heading.title)) continue;
    systems.push(...summarizeSection(heading.title, sectionHtml));
  }

  return {
    champion_buffs: rankLines(buffs, opening),
    champion_nerfs: rankLines(nerfs, opening),
    system_changes: [...adjustments, ...systems].slice(0, CAP).map((line) => shorten(line, 170)),
  };
}

function collectChampions(
  sectionHtml: string,
  buffs: ChangeLine[],
  nerfs: ChangeLine[],
  adjustments: string[],
): void {
  const headings = parseHeadings(sectionHtml);
  const champions = headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => heading.level === 3 && heading.title && !isAbilityTitle(heading.title));

  champions.forEach(({ heading, index }, order) => {
    const next = champions[order + 1]?.heading.tagStart ?? sectionHtml.length;
    const chunk = sectionHtml.slice(heading.contentStart, next);
    const blurb = firstBlockquote(chunk) || textContent(chunk).slice(0, 500);
    const kind = classifyChange(blurb);
    const line = formatChange(heading.title, chunk, blurb);
    if (kind === "buff") buffs.push({ name: heading.title, line, index });
    else if (kind === "nerf") nerfs.push({ name: heading.title, line, index });
    else adjustments.push(shorten(`${heading.title}: ${firstSentence(blurb) || "adjustment"}`, 170));
  });
}

function summarizeSection(title: string, sectionHtml: string): string[] {
  if (isDetailSection(title)) {
    const headings = parseHeadings(sectionHtml);
    const subjects = headings.filter(
      (heading) => heading.level === 3 && heading.title && !isAbilityTitle(heading.title),
    );
    if (subjects.length > 0) {
      return subjects.map((heading) => {
        const chunk = sliceInner(sectionHtml, headings, heading);
        return formatChange(heading.title, chunk, firstBlockquote(chunk));
      });
    }
  }
  const blurb = firstBlockquote(sectionHtml) || firstParagraph(sectionHtml);
  if (!blurb) return [];
  return [`${title}: ${firstSentence(blurb)}`];
}

function formatChange(name: string, chunk: string, blurb: string): string {
  const ability = parseHeadings(chunk).find((heading) => isAbilityTitle(heading.title))?.title;
  const change = listItems(chunk)[0];
  const detail = change ? compressChange(change) : firstSentence(blurb);
  const label = ability ? `${name}: ${ability}` : name;
  return shorten(`${label} — ${detail || "balance changes"}`, 170);
}

export function classifyChange(blurb: string): ChangeKind {
  const text = blurb.toLowerCase();
  let score = 0;
  const rules: Array<[RegExp, number]> = [
    [/\bbuffing\b/g, 3],
    [/\bbuffed\b/g, 2],
    [/\bbuffs?\b/g, 2],
    [/\bnerfing\b/g, -3],
    [/\bnerfed\b/g, -2],
    [/\bnerfs?\b/g, -2],
    [/\bbumps?\b/g, 2],
    [/\bbumped\b/g, 2],
    [/\btoo strong\b/g, -2],
    [/\boverperform\w*/g, -2],
    [/\btone(?:d)? down\b/g, -2],
    [/\bspace to be better\b/g, 2],
    [/\bmore satisfying\b/g, 1],
    [/\bhelp (?:her|him|them|out)\b/g, 1],
  ];
  for (const [pattern, weight] of rules) {
    score += (text.match(pattern) ?? []).length * weight;
  }
  if (score > 0) return "buff";
  if (score < 0) return "nerf";
  return "adjust";
}

function compressChange(item: string): string {
  const normalized = item
    .replace(/\s*(?:⇒|→|=>)\s*/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = normalized.split(/\s+to\s+/);
  if (parts.length !== 2) return normalized;
  let [before, after] = parts;
  let label = "";
  const labeled = before.match(/^([^:]{1,40}):\s*(.*)$/);
  if (labeled) {
    label = labeled[1];
    before = labeled[2];
  }
  let index = 0;
  const limit = Math.min(before.length, after.length);
  while (index < limit && before[index] === after[index]) index += 1;
  while (index > 0 && !/[\s(+]/.test(before[index - 1] ?? "")) index -= 1;
  const left = before.slice(index).replace(/[)\s]+$/g, "").trim();
  const right = after.slice(index).replace(/[)\s]+$/g, "").trim();
  const shared = before.slice(0, index).trim().length;
  if (shared >= 6 && left && right && left !== right && left.length <= 48 && right.length <= 48) {
    return `${label ? `${label} ` : ""}${left} to ${right}`.replace(/\s+/g, " ");
  }
  return normalized;
}

function rankLines(lines: ChangeLine[], intro: string): string[] {
  const introLower = intro.toLowerCase();
  return [...lines]
    .sort((a, b) => {
      const aMention = introLower.includes(a.name.toLowerCase()) ? 0 : 1;
      const bMention = introLower.includes(b.name.toLowerCase()) ? 0 : 1;
      if (aMention !== bMention) return aMention - bMention;
      return a.index - b.index;
    })
    .slice(0, CAP)
    .map((line) => line.line);
}

function isChampionSection(title: string): boolean {
  return /^champions?$/i.test(title.trim());
}

function skipSection(title: string): boolean {
  return /bug\s*fix|upcoming skin|chromas?|patch highlights|mid-patch|quality of life|\bqol\b|skin spotlight/i.test(
    title,
  );
}

function isDetailSection(title: string): boolean {
  return /\b(items?|runes?|systems?|objectives?)\b/i.test(title);
}

function isAbilityTitle(title: string): boolean {
  return /^(?:passive|base stats|[qwer])\b/i.test(title.trim());
}

function sliceSection(html: string, headings: Heading[], index: number, level: number): string {
  const start = headings[index].contentStart;
  let end = html.length;
  for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
    if (headings[cursor].level <= level) {
      end = headings[cursor].tagStart;
      break;
    }
  }
  return html.slice(start, end);
}

function sliceInner(html: string, headings: Heading[], heading: Heading): string {
  const index = headings.indexOf(heading);
  const start = heading.contentStart;
  let end = html.length;
  for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
    if (headings[cursor].level <= heading.level) {
      end = headings[cursor].tagStart;
      break;
    }
  }
  return html.slice(start, end);
}

function textBefore(html: string, index: number): string {
  if (index <= 0) return "";
  return textContent(html.slice(0, index));
}

function firstBlockquote(html: string): string {
  const match = html.match(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/i);
  return match ? textContent(match[1]) : "";
}

function firstParagraph(html: string): string {
  const match = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return match ? textContent(match[1]) : "";
}

function listItems(html: string): string[] {
  const items: string[] = [];
  for (const match of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = textContent(match[1] ?? "");
    if (text) items.push(text);
  }
  return items;
}
