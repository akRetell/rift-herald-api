import { unstable_cache } from "next/cache";
import { NotFoundError, UpstreamError } from "./errors";
import { fetchJson, REVALIDATE_SECONDS } from "./http";
import { normalizeChampionKey } from "./builds";
import { textContent } from "./html";

const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";

type ChampionIndexEntry = {
  id: string;
  name: string;
  title: string;
  blurb: string;
  tags: string[];
};

type ChampionIndexFile = {
  data: Record<string, ChampionIndexEntry>;
};

type ChampionDetailFile = {
  data: Record<
    string,
    {
      passive?: { name?: string };
      spells?: Array<{ name?: string }>;
    }
  >;
};

export type ChampionInfo = {
  champion: string;
  title: string;
  tags: string[];
  blurb: string;
  abilities: string[];
};

export const getLatestVersion = unstable_cache(
  async () => {
    const versions = await fetchJson<string[]>(VERSIONS_URL);
    const latest = versions.find((version) => /^\d+\.\d+/.test(version));
    if (!latest) throw new UpstreamError("Data Dragon did not return a patch version.");
    return latest;
  },
  ["ddragon-latest-version"],
  { revalidate: REVALIDATE_SECONDS },
);

const getChampionIndex = unstable_cache(
  async (version: string) => {
    const file = await fetchJson<ChampionIndexFile>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    );
    return Object.values(file.data);
  },
  ["ddragon-champion-index"],
  { revalidate: REVALIDATE_SECONDS },
);

const getChampionDetail = unstable_cache(
  async (version: string, id: string) => {
    const file = await fetchJson<ChampionDetailFile>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${id}.json`,
    );
    return file.data[id];
  },
  ["ddragon-champion-detail"],
  { revalidate: REVALIDATE_SECONDS },
);

export async function getChampionInfo(name: string): Promise<ChampionInfo> {
  const version = await getLatestVersion();
  const index = await getChampionIndex(version);
  const key = normalizeChampionKey(name);
  const match = index.find(
    (champion) =>
      normalizeChampionKey(champion.id) === key || normalizeChampionKey(champion.name) === key,
  );
  if (!match) {
    throw new NotFoundError(`Data Dragon has no champion named "${name.trim()}".`);
  }
  const detail = await getChampionDetail(version, match.id);
  const abilities = [
    detail?.passive?.name,
    ...(detail?.spells ?? []).map((spell) => spell.name),
  ].filter((ability): ability is string => Boolean(ability));
  return {
    champion: match.name,
    title: match.title,
    tags: match.tags ?? [],
    blurb: textContent(match.blurb),
    abilities,
  };
}
