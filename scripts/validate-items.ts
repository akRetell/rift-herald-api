import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Catalog = Record<string, { core_items: string[] }>;

type ItemFile = {
  data: Record<string, { name?: string }>;
};

const EXPECTED = ["Ahri", "Jinx", "Yasuo", "Lee Sin", "Thresh", "Lux", "Darius", "Kai'Sa", "Ezreal", "Ornn"];

async function main(): Promise<void> {
  const catalog = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/builds.json"), "utf8"),
  ) as Catalog;
  const names = Object.keys(catalog);
  const missingRoster = EXPECTED.filter((name) => !names.includes(name));
  const extras = names.filter((name) => !EXPECTED.includes(name));
  if (missingRoster.length > 0 || extras.length > 0) {
    throw new Error(
      `Roster mismatch. Missing: ${missingRoster.join(", ") || "(none)"}. Extra: ${extras.join(", ") || "(none)"}.`,
    );
  }

  const versions = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json()) as string[];
  const version = versions[0];
  if (!version) throw new Error("Data Dragon returned no versions.");
  const items = (await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`)
  ).json()) as ItemFile;
  const itemNames = new Set(
    Object.values(items.data)
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name)),
  );

  const missing: string[] = [];
  for (const [champion, build] of Object.entries(catalog)) {
    if (build.core_items.length < 2) {
      missing.push(`${champion} has too few core items`);
    }
    for (const item of build.core_items) {
      if (!itemNames.has(item)) missing.push(`${champion}: "${item}" is not in Data Dragon ${version}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(missing.join("\n"));
  }
  console.log(`Validated ${names.length} builds against Data Dragon ${version} (${itemNames.size} item names).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
