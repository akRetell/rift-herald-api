import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groupBundles, settleWorldsAttempt, standingsFromBundles } from "./worlds-service";
import {
  pickTournament,
  stageStatus,
  standingsFromSeries,
  summarizeStandings,
  unavailableStandings,
  type TournamentRow,
} from "./worlds";

const now = new Date("2026-11-06T12:00:00Z");

test("picks the Worlds stage that is in progress", () => {
  const rows = [
    tournament("Worlds/2026 Season/Play-In", "Play-In", "2026-10-15", "2026-10-18"),
    tournament("Worlds/2026 Season/Swiss Stage", "Swiss Stage", "2026-10-23", "2026-10-31"),
    tournament("Worlds/2026 Season/Knockout Stage", "Knockout Stage", "2026-11-03", "2026-11-08"),
    tournament("Worlds/2026 Season/Final", "Final", "2026-11-14", "2026-11-14"),
  ];
  const chosen = pickTournament(rows, now);
  assert.equal(chosen?.overviewPage, "Worlds/2026 Season/Knockout Stage");
  assert.equal(stageStatus(chosen!, now), "in_progress");
});

test("falls back to the latest started stage when nothing is live", () => {
  const rows = [
    tournament("Worlds/2025 Season/Swiss Stage", "Swiss Stage", "2025-10-01", "2025-10-10"),
    tournament("Worlds/2025 Season/Final", "Final", "2025-11-01", "2025-11-02"),
  ];
  const chosen = pickTournament(rows, now);
  assert.equal(chosen?.split, "Final");
  assert.equal(stageStatus(chosen!, now), "completed");
});

test("builds series records and a spoken summary", () => {
  const standings = standingsFromSeries([
    { team1: "Gen.G", team2: "LYON", winner: "1" },
    { team1: "Top Esports", team2: "Invictus Gaming", winner: "2" },
    { team1: "Dplus KIA", team2: "Bilibili Gaming", winner: "2" },
  ]);
  assert.deepEqual(
    standings.map((standing) => `${standing.team} ${standing.record}`),
    ["Bilibili Gaming 1-0", "Gen.G 1-0", "Invictus Gaming 1-0", "Dplus KIA 0-1", "LYON 0-1", "Top Esports 0-1"],
  );
  const summary = summarizeStandings(
    "2026 World Championship",
    "Knockout Stage",
    standings.slice(0, 4),
    "in_progress",
  );
  assert.match(summary, /2026 World Championship is in the Knockout Stage/);
  assert.match(summary, /Gen\.G is 1-0/);
  assert.equal(summary.split(". ").length <= 3, true);
});

test("names a champion only after a deciding stage is over", () => {
  const summary = summarizeStandings(
    "2026 World Championship",
    "Final",
    [
      { team: "T1", place: 1, record: "3-0" },
      { team: "Gen.G", place: 2, record: "2-1" },
    ],
    "completed",
  );
  assert.match(summary, /^T1 won 2026 World Championship/);
  assert.match(summary, /Gen\.G finished second/);
});

test("parses a realistic Cargo fixture into the in-progress knockout table", () => {
  const payload = JSON.parse(
    readFileSync(new URL("./fixtures/worlds-cargo.json", import.meta.url), "utf8"),
  ) as { cargoquery: Array<{ title: Record<string, string> }> };
  const bundles = groupBundles(
    payload.cargoquery.map((row) => row.title),
    2026,
  );
  const result = standingsFromBundles(bundles, now);
  assert.equal(result.event, "2026 World Championship");
  assert.equal(result.stage, "Knockout Stage");
  assert.equal(result.standings[0]?.team, "Gen.G");
  assert.equal(result.standings[0]?.place, 1);
  assert.equal(result.standings[0]?.record, "1-0");
  assert.match(result.summary, /2026 World Championship is in the Knockout Stage/);
  assert.match(result.summary, /Gen\.G is in first with a 1-0 record/);
  assert.equal(result.standings.some((row) => row.team === "LYON"), true);
  assert.equal(bundles.find((bundle) => bundle.tournament.split === "Final")?.standings.length, 0);
});

test("keeps the last good table when a later fetch fails", () => {
  const lastGood = {
    event: "2026 World Championship",
    stage: "Swiss Stage",
    standings: [{ team: "Gen.G", place: 1, record: "3-0" }],
    summary: "Swiss Stage of 2026 World Championship is complete. Gen.G is in first with a 3-0 record.",
  };
  assert.equal(settleWorldsAttempt({ ok: false }, lastGood, 2026).stage, "Swiss Stage");
  assert.equal(
    settleWorldsAttempt({ ok: false }, undefined, 2026).summary,
    "Worlds standings are temporarily unavailable.",
  );
  assert.match(unavailableStandings(2026).summary, /standings are temporarily unavailable/i);
});

test("groups a joined Cargo row set by tournament page", () => {
  const bundles = groupBundles(
    [
      {
        OverviewPage: "Worlds/2026 Season/Swiss Stage",
        Name: "Worlds 2026 Swiss",
        DateStart: "2026-10-23",
        DateEnd: "2026-10-31",
        Split: "Swiss Stage",
        Year: "2026",
        Team: "Gen.G",
        Place: "1",
        WinSeries: "3",
        LossSeries: "0",
      },
      {
        OverviewPage: "Worlds/2026 Season/Swiss Stage",
        Team: "T1",
        Place: "4",
        WinSeries: "3",
        LossSeries: "1",
      },
      {
        OverviewPage: "Worlds/2026 Season/Knockout Stage",
        Name: "Worlds 2026 Knockouts",
        DateStart: "2026-11-03",
        DateEnd: "2026-11-08",
        Split: "Knockout Stage",
        Year: "2026",
        Team: "",
      },
    ],
    2026,
  );
  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].standings.length, 2);
  assert.equal(bundles[0].standings[0].team, "Gen.G");
  assert.equal(bundles[1].standings.length, 0);
  assert.equal(bundles[1].tournament.split, "Knockout Stage");
});

function tournament(overviewPage: string, split: string, dateStart: string, dateEnd: string): TournamentRow {
  return {
    overviewPage,
    name: split,
    dateStart,
    dateEnd,
    split,
    year: "2026",
  };
}
