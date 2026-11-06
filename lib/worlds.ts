export type Standing = {
  team: string;
  place?: number;
  record?: string;
};

export type StageStatus = "upcoming" | "in_progress" | "completed";

export type TournamentRow = {
  overviewPage: string;
  name: string;
  dateStart: string;
  dateEnd: string;
  split: string;
  year: string;
};

export type WorldsStandings = {
  event: string;
  stage: string;
  standings: Standing[];
  summary: string;
};

/** Spoken when Leaguepedia rate-limits or times out and no earlier table is cached. */
export function unavailableStandings(year: number): WorldsStandings {
  return {
    event: `${year} World Championship`,
    stage: "unavailable",
    standings: [],
    summary: "Worlds standings are temporarily unavailable.",
  };
}

const PLACE_WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

export function pickTournament(rows: TournamentRow[], now: Date): TournamentRow | null {
  const parsed = rows
    .map((row) => ({
      row,
      start: Date.parse(row.dateStart),
      end: Date.parse(row.dateEnd),
    }))
    .filter((entry) => entry.row.overviewPage && !Number.isNaN(entry.start));
  if (parsed.length === 0) return null;

  const instant = now.getTime();
  const started = parsed.filter((entry) => entry.start <= instant);
  const current = started.filter(
    (entry) => Number.isNaN(entry.end) || entry.end >= instant - 36 * 60 * 60 * 1000,
  );
  const pool = current.length > 0 ? current : started.length > 0 ? started : parsed;
  pool.sort((a, b) => {
    if (current.length === 0 && started.length === 0) return a.start - b.start;
    return b.start - a.start;
  });
  return pool[0].row;
}

export function stageStatus(row: TournamentRow, now: Date): StageStatus {
  const start = Date.parse(row.dateStart);
  const end = Date.parse(row.dateEnd);
  const instant = now.getTime();
  if (!Number.isNaN(start) && instant < start) return "upcoming";
  if (!Number.isNaN(end) && instant > end) return "completed";
  return "in_progress";
}

export function eventTitle(row: TournamentRow): string {
  const year = row.year || yearFromPage(row.overviewPage) || "";
  return year ? `${year} World Championship` : "World Championship";
}

export function stageTitle(row: TournamentRow): string {
  if (row.split.trim()) return row.split.trim();
  const parts = row.overviewPage.split("/").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "the tournament";
  return last.replace(/\s+season$/i, "").trim() || last;
}

export function summarizeStandings(
  event: string,
  stage: string,
  standings: Standing[],
  status: StageStatus,
): string {
  if (standings.length === 0) {
    if (status === "upcoming") {
      return `${event} has not started yet. The next stage on the books is ${stage}.`;
    }
    return `Standings for the ${stage} of ${event} are not posted yet.`;
  }

  const top = standings.slice(0, 4);
  const winner = standings.find((standing) => standing.place === 1);
  const deciding = /final|knockout|bracket|main event/i.test(stage);
  if (status === "completed" && winner && deciding) {
    const rest = standings
      .filter((standing) => standing.team !== winner.team && standing.place != null)
      .slice(0, 3);
    const restSentence =
      rest.length > 0
        ? ` ${rest.map((standing) => `${standing.team} finished ${placeWord(standing.place ?? 0)}`).join(", ")}.`
        : "";
    return `${winner.team} won ${event}. The latest stage was ${stage}.${restSentence}`.replace(
      /\s+/g,
      " ",
    );
  }

  const detail = joinClauses(top.map(describeStanding));
  if (status === "completed") {
    return `${stage} of ${event} is complete. ${detail}.`;
  }
  if (status === "upcoming") {
    return `${stage} of ${event} has not started yet.`;
  }
  return `${event} is in the ${stage}. ${detail}.`;
}

export function standingsFromSeries(
  matches: Array<{ team1: string; team2: string; winner: string }>,
): Standing[] {
  const table = new Map<string, { wins: number; losses: number }>();
  const bucket = (team: string) => {
    const name = team.trim();
    if (!name) return null;
    const existing = table.get(name) ?? { wins: 0, losses: 0 };
    table.set(name, existing);
    return existing;
  };
  for (const match of matches) {
    let winner = "";
    let loser = "";
    if (match.winner === "1") {
      winner = match.team1;
      loser = match.team2;
    } else if (match.winner === "2") {
      winner = match.team2;
      loser = match.team1;
    } else {
      continue;
    }
    const winBucket = bucket(winner);
    const lossBucket = bucket(loser);
    if (winBucket) winBucket.wins += 1;
    if (lossBucket) lossBucket.losses += 1;
  }
  return [...table.entries()]
    .map(([team, record]) => ({ team, record: `${record.wins}-${record.losses}` }))
    .sort((a, b) => {
      const [aw, al] = splitRecord(a.record);
      const [bw, bl] = splitRecord(b.record);
      return bw - aw || al - bl || a.team.localeCompare(b.team);
    });
}

export function standingFromCargo(row: Record<string, string>): Standing | null {
  const team = cargoField(row, "Team");
  if (!team) return null;
  const place = numberOrUndefined(cargoField(row, "Place"));
  const wins = numberOrUndefined(cargoField(row, "WinSeries"));
  const losses = numberOrUndefined(cargoField(row, "LossSeries"));
  const standing: Standing = { team };
  if (place != null && place > 0) standing.place = place;
  if (wins != null || losses != null) standing.record = `${wins ?? 0}-${losses ?? 0}`;
  if (standing.place == null && standing.record == null) standing.record = "0-0";
  return standing;
}

export function cargoField(row: Record<string, string>, name: string): string {
  if (name in row && row[name] != null) return String(row[name]);
  const found = Object.keys(row).find((key) => key.toLowerCase() === name.toLowerCase());
  return found ? String(row[found] ?? "") : "";
}

function describeStanding(standing: Standing): string {
  if (standing.place != null && standing.record) {
    return `${standing.team} is in ${placeWord(standing.place)} with a ${standing.record} record`;
  }
  if (standing.place != null) return `${standing.team} is in ${placeWord(standing.place)}`;
  if (standing.record) return `${standing.team} is ${standing.record}`;
  return standing.team;
}

function placeWord(place: number): string {
  return PLACE_WORDS[place] ?? `${place}th`;
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return "No teams are listed";
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]}, and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}

function splitRecord(record: string | undefined): [number, number] {
  const [wins, losses] = (record ?? "0-0").split("-").map((part) => Number(part));
  return [Number.isFinite(wins) ? wins : 0, Number.isFinite(losses) ? losses : 0];
}

function yearFromPage(overviewPage: string): string {
  const match = overviewPage.match(/(\d{4})/);
  return match?.[1] ?? "";
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
