import catalog from "../data/builds.json";
import { NotFoundError } from "./errors";

export type ChampionBuild = {
  champion: string;
  core_items: string[];
  runes: string;
  skill_order: string;
};

type CatalogEntry = {
  core_items: string[];
  runes: string;
  skill_order: string;
};

const BUILDS = catalog as Record<string, CatalogEntry>;

const BY_KEY = new Map<string, string>(
  Object.keys(BUILDS).map((name) => [normalizeChampionKey(name), name]),
);

export const ROSTER = Object.keys(BUILDS);

export function normalizeChampionKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getChampionBuild(name: string): ChampionBuild {
  const canonical = BY_KEY.get(normalizeChampionKey(name));
  if (!canonical) {
    throw new NotFoundError(
      `No curated build for "${name.trim() || "that champion"}". Rift Herald can walk through ${rosterSentence()}.`,
    );
  }
  const entry = BUILDS[canonical];
  return {
    champion: canonical,
    core_items: entry.core_items,
    runes: entry.runes,
    skill_order: entry.skill_order,
  };
}

export function rosterSentence(): string {
  const names = [...ROSTER];
  const last = names.pop();
  return `${names.join(", ")}, and ${last}`;
}
