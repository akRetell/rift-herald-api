import { unstable_cache } from "next/cache";
import { BadRequestError, UpstreamError } from "./errors";
import { fetchJson, REVALIDATE_SECONDS, USER_AGENT } from "./http";
import {
  cargoField,
  eventTitle,
  pickTournament,
  stageStatus,
  stageTitle,
  standingFromCargo,
  standingsFromSeries,
  summarizeStandings,
  unavailableStandings,
  type Standing,
  type TournamentRow,
  type WorldsStandings,
} from "./worlds";

const API = "https://lol.fandom.com/api.php";

type CargoResponse = {
  cargoquery?: Array<{ title?: Record<string, string> }>;
  error?: { code?: string; info?: string };
};

type StageBundle = {
  tournament: TournamentRow;
  standings: Standing[];
};

const WORLDS_TIMEOUT_MS = 4_000;

const lastGood = new Map<string, { at: number; value: WorldsStandings }>();

export async function getWorldsStandings(yearInput?: number): Promise<WorldsStandings> {
  const now = new Date();
  const year = yearInput ?? now.getUTCFullYear();
  if (!Number.isInteger(year) || year < 2011 || year > now.getUTCFullYear() + 1) {
    throw new BadRequestError(`Year ${String(yearInput)} is not a Worlds season we can look up.`);
  }
  const cacheKey = `${year}:${yearInput == null ? "recent" : "exact"}`;
  const cached = lastGood.get(cacheKey);
  if (cached && Date.now() - cached.at < REVALIDATE_SECONDS * 1000) return cached.value;
  try {
    const value = await loadWorlds(year, yearInput == null ? 1 : 0);
    lastGood.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error("Worlds standings fetch failed", error);
    if (cached) return cached.value;
    return unavailableStandings(year);
  }
}

/** Prefer a fresh table, then the last good table, then a spoken unavailable line. */
export function settleWorldsAttempt(
  attempt: { ok: true; value: WorldsStandings } | { ok: false },
  lastGoodValue: WorldsStandings | undefined,
  year: number,
): WorldsStandings {
  if (attempt.ok) return attempt.value;
  return lastGoodValue ?? unavailableStandings(year);
}

const loadWorlds = unstable_cache(
  async (year: number, fallbackToPrevious: number) =>
    fetchWorlds(year, new Date(), fallbackToPrevious === 1),
  ["worlds-standings-v2"],
  { revalidate: REVALIDATE_SECONDS },
);

async function fetchWorlds(
  year: number,
  now: Date,
  fallbackToPrevious: boolean,
): Promise<WorldsStandings> {
  let bundles = await loadBundles(year);
  if (bundles.length === 0 && fallbackToPrevious) {
    bundles = await loadBundles(year - 1);
  }
  let table = standingsFromBundles(bundles, now);
  if (table.standings.length === 0) {
    const chosen = pickTournament(
      bundles.map((bundle) => bundle.tournament),
      now,
    );
    if (chosen) {
      const series = await seriesOrEmpty(chosen.overviewPage);
      if (series.length > 0) {
        table = spokenTable(chosen, series, now);
      }
    }
  }
  if (table.standings.length === 0 && bundles.length === 0) {
    throw new UpstreamError(`Leaguepedia has no Worlds ${year} tournament pages yet.`);
  }
  return table;
}

export function standingsFromBundles(bundles: StageBundle[], now: Date): WorldsStandings {
  const chosen = pickTournament(
    bundles.map((bundle) => bundle.tournament),
    now,
  );
  if (!chosen) {
    return {
      event: "World Championship",
      stage: "unavailable",
      standings: [],
      summary: "Worlds standings are temporarily unavailable.",
    };
  }
  const chosenBundle = bundles.find((bundle) => bundle.tournament.overviewPage === chosen.overviewPage);
  let tournament = chosen;
  let standings = chosenBundle?.standings ?? [];
  if (standings.length === 0) {
    const earlier = bundles
      .filter((bundle) => bundle.standings.length > 0)
      .filter((bundle) => Date.parse(bundle.tournament.dateStart) <= Date.parse(chosen.dateStart))
      .sort((a, b) => Date.parse(b.tournament.dateStart) - Date.parse(a.tournament.dateStart))[0];
    if (earlier) {
      tournament = earlier.tournament;
      standings = earlier.standings;
    }
  }
  return spokenTable(tournament, standings, now);
}

function spokenTable(tournament: TournamentRow, standings: Standing[], now: Date): WorldsStandings {
  const event = eventTitle(tournament);
  const stage = stageTitle(tournament);
  const status = stageStatus(tournament, now);
  const table = [...standings].sort(compareStandings).slice(0, 16);
  return {
    event,
    stage,
    standings: table,
    summary: summarizeStandings(event, stage, table.slice(0, 8), status),
  };
}

/**
 * One Cargo query joins the tournament list to its standings. Leaguepedia's
 * anonymous cargoquery limit is tight, so a voice-agent call stays on a
 * single request unless the current stage has no table yet.
 */
async function loadBundles(year: number): Promise<StageBundle[]> {
  const rows = await cargoQuery({
    tables: "Tournaments=T,Standings=S",
    join_on: "T.OverviewPage=S.OverviewPage",
    fields:
      "T.OverviewPage=OverviewPage,T.Name=Name,T.DateStart=DateStart,T.Date=DateEnd,T.Split=Split,T.Year=Year,S.Team=Team,S.Place=Place,S.WinSeries=WinSeries,S.LossSeries=LossSeries",
    where: `T.League="Worlds" AND T.OverviewPage LIKE "Worlds/${year}%"`,
    order_by: "T.DateStart",
    limit: "500",
  });
  return groupBundles(rows, year);
}

async function seriesOrEmpty(overviewPage: string): Promise<Standing[]> {
  try {
    const rows = await cargoQuery({
      tables: "MatchSchedule",
      fields: "Team1,Team2,Winner",
      where: `OverviewPage="${overviewPage.replaceAll('"', '""')}"`,
      order_by: "DateTime_UTC",
      limit: "200",
    });
    return standingsFromSeries(
      rows.map((row) => ({
        team1: cargoField(row, "Team1"),
        team2: cargoField(row, "Team2"),
        winner: cargoField(row, "Winner"),
      })),
    );
  } catch (error) {
    console.error("Match schedule fallback failed", error);
    return [];
  }
}

export function groupBundles(rows: Array<Record<string, string>>, year: number): StageBundle[] {
  const bundles: StageBundle[] = [];
  const index = new Map<string, StageBundle>();
  for (const row of rows) {
    const overviewPage = cargoField(row, "OverviewPage");
    if (!overviewPage) continue;
    let bundle = index.get(overviewPage);
    if (!bundle) {
      bundle = {
        tournament: {
          overviewPage,
          name: cargoField(row, "Name"),
          dateStart: cargoField(row, "DateStart"),
          dateEnd: cargoField(row, "DateEnd") || cargoField(row, "Date"),
          split: cargoField(row, "Split"),
          year: cargoField(row, "Year") || String(year),
        },
        standings: [],
      };
      index.set(overviewPage, bundle);
      bundles.push(bundle);
    }
    const standing = standingFromCargo(row);
    if (standing) bundle.standings.push(standing);
  }
  for (const bundle of bundles) bundle.standings.sort(compareStandings);
  return bundles;
}

async function cargoQuery(params: Record<string, string>): Promise<Array<Record<string, string>>> {
  const url = new URL(API);
  url.searchParams.set("action", "cargoquery");
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const json = await fetchJson<CargoResponse>(url.toString(), USER_AGENT, WORLDS_TIMEOUT_MS);
  if (json.error) {
    const info = json.error.info || json.error.code || "Leaguepedia rejected the query.";
    throw new UpstreamError(
      json.error.code === "ratelimited"
        ? "Leaguepedia is rate limiting standings right now. Try again in a minute."
        : `Leaguepedia standings request failed: ${info}`,
    );
  }
  return (json.cargoquery ?? []).map((row) => row.title ?? {});
}

function compareStandings(a: Standing, b: Standing): number {
  const place = (a.place ?? 99) - (b.place ?? 99);
  if (place !== 0) return place;
  const [aw, al] = splitRecord(a.record);
  const [bw, bl] = splitRecord(b.record);
  return bw - aw || al - bl || a.team.localeCompare(b.team);
}

function splitRecord(record: string | undefined): [number, number] {
  const [wins, losses] = (record ?? "0-0").split("-").map((part) => Number(part));
  return [Number.isFinite(wins) ? wins : 0, Number.isFinite(losses) ? losses : 0];
}
