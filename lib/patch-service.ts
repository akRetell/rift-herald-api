import { unstable_cache } from "next/cache";
import { BadRequestError, NotFoundError, UpstreamError } from "./errors";
import { fetchText, REVALIDATE_SECONDS } from "./http";
import {
  absoluteArticleUrl,
  extractArticleBody,
  extractArticleCards,
  findArticle,
} from "./patch-match";
import { parsePatchNotes } from "./patch-parse";
import { getLatestVersion } from "./ddragon-service";

const PATCH_INDEX_URL = "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/";

export type PatchNotesResponse = {
  patch: string;
  headline: string;
  champion_buffs: string[];
  champion_nerfs: string[];
  system_changes: string[];
  url: string;
};

const loadIndex = unstable_cache(
  async () => {
    const html = await fetchText(PATCH_INDEX_URL);
    const cards = extractArticleCards(html);
    if (cards.length === 0) {
      throw new UpstreamError("The patch notes index did not list any articles.");
    }
    return cards;
  },
  ["patch-notes-index"],
  { revalidate: REVALIDATE_SECONDS },
);

const loadArticle = unstable_cache(
  async (url: string) => {
    const html = await fetchText(url);
    const article = extractArticleBody(html);
    if (!article.bodyHtml) {
      throw new UpstreamError("The patch notes article did not include a notes body.");
    }
    return article;
  },
  ["patch-notes-article"],
  { revalidate: REVALIDATE_SECONDS },
);

export async function getPatchNotes(requested: string | undefined): Promise<PatchNotesResponse> {
  const query = await resolveRequestedPatch(requested);
  const cards = await loadIndex();
  const card = findArticle(cards, query);
  if (!card) {
    throw new NotFoundError(
      `No official patch notes article matched "${query}". The index covers the en-us game-updates patch notes, including older slug styles.`,
    );
  }
  const url = absoluteArticleUrl(card.url);
  const article = await loadArticle(url);
  const patch = articleTitlePatch(article.title) ?? card.display ?? query;
  const headline = article.description || card.description || article.title;
  if (!headline) {
    throw new UpstreamError("The patch notes article had no headline.");
  }
  const summary = parsePatchNotes(article.bodyHtml, `${headline} ${card.description}`);
  return {
    patch,
    headline: headline.replace(/\s+/g, " ").trim(),
    ...summary,
    url,
  };
}

async function resolveRequestedPatch(requested: string | undefined): Promise<string> {
  if (!requested || /^(latest|current)$/i.test(requested)) {
    return getLatestVersion();
  }
  if (requested.length > 32) {
    throw new BadRequestError("Patch version is too long.");
  }
  return requested;
}

function articleTitlePatch(title: string): string | null {
  const match = title.match(
    /patch\s+((?:20)?\d{2}\.s\d+\.\d+[a-z]?|\d{1,4}\.\d{1,2}[a-z]?)/i,
  );
  return match?.[1] ?? null;
}
