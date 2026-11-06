# Rift Herald

League of Legends endpoints for a Retell conversation-flow voice agent named **Rift Herald**. The app is a Next.js (App Router, TypeScript) project with no database and no paid or keyed APIs. Deploy it to Vercel with the default Next.js preset. Nothing in `vercel.json` is required.

Upstream data comes from:

- Riot's public patch-notes index and articles on `leagueoflegends.com` (en-us game updates)
- Data Dragon (`ddragon.leagueoflegends.com`) for versions, champions, and item names
- Leaguepedia's public Cargo API for World Championship standings

Responses that depend on those sources are cached for about an hour (`revalidate` / `unstable_cache`, 3600 seconds). Curated builds are static.

## Run locally

```bash
npm install
npm test          # unit tests, plus a live check that build items exist in Data Dragon
npm run dev       # http://localhost:3000
```

`npm run build` then `npm start` is the production server Vercel runs.

## Patch numbers

Data Dragon and the public patch notes do not share a major version anymore. As of this writing, Data Dragon's latest version is `16.22.1` and the matching article is titled **Patch 26.22**. The same split holds for 2025: Data Dragon `15.x` is the public `25.x` notes, and `15.1` / `15.2` / `15.3` are the season articles `25.S1.1`, `25.S1.2`, and `2025.S1.3`.

`POST /api/patch-notes` accepts either form (`16.22.1`, `16.22`, `26.22`, `25.S1.1`, `14.10`, `13.1b`). It discovers the article from the [patch notes index](https://www.leagueoflegends.com/en-us/news/tags/patch-notes/), which lists every historical slug (`league-of-legends-patch-26-22-notes`, `patch-14-10-notes`, `lol-patch-14-13-notes`, `patch-13-1b-notes`, and so on). The `patch` field in the response is the version printed on the article.

If `patch` is omitted, the route uses the first entry of `https://ddragon.leagueoflegends.com/api/versions.json`.

## Optional auth

Custom-function routes are open unless you set environment variables.

| Variable | Effect |
| --- | --- |
| `RETELL_SHARED_SECRET` | When set, `POST /api/patch-notes`, `POST /api/log`, and `GET` or `POST /api/build` require header `x-api-key` to match. `/api/mcp` does not check it. |
| `RETELL_API_KEY` | When set, a request that includes `x-retell-signature` is verified. The header is `v=<unix-ms>,d=<hex>`. The digest is HMAC-SHA256 of the raw body concatenated with the timestamp, keyed by the API key, and the timestamp must be within 5 minutes. Requests with no signature header are still accepted, so local curls keep working. |

In Retell, add the header on each custom function:

```text
x-api-key: <RETELL_SHARED_SECRET>
```

Copy `.env.example` to `.env.local` for local runs. On Vercel, set the same variables in Project Settings → Environment Variables.

## Endpoints

### `POST /api/patch-notes`

Retell custom function: `get_patch_notes`.

Body (either shape):

```json
{ "patch": "16.22.1" }
```

```json
{ "name": "get_patch_notes", "args": { "patch": "16.22.1" }, "call": {} }
```

`patch` is optional. Success:

```json
{
  "patch": "26.22",
  "headline": "Patch 26.22 is at the top of the charts. K/DA is starting fires, Mel got a midscope, and plenty of changes are in for SR, Mayhem, and Classic.",
  "champion_buffs": [
    "Corki: R - Missile Barrage — Damage: 90 / 170 / 250 (+85% bonus AD) to 100 / 190 / 280 (+90% bonus AD)",
    "Rumble: R - The Equalizer — Damage per Second: 120 / 200 / 280 (+35% AP) to (+40% AP)"
  ],
  "champion_nerfs": [
    "Locke: Q - Ritual Nails — Stack Bonus Damage: 18 / 26 / 34 / 42 / 50 to 15 / 22 / 29 / 36 / 43",
    "Yasuo: Q - Steel Tempest — Damage 105% total AD to 100% total AD"
  ],
  "system_changes": [
    "Mel: This patch, Mel is getting a midscope adjustment.",
    "Doran's Bow — Attack Damage: 8 to 7"
  ],
  "url": "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/"
}
```

Each list is capped at 5 short lines. Champion direction comes from the designer's note on that champion (buff, nerf, or an adjustment such as a midscope, which is returned under `system_changes`). Failures are JSON `{ "error": "..." }` with a non-2xx status (`400` bad patch, `401` auth, `404` no article, `502` upstream).

### `POST /api/log`

Retell custom function: `log_request`. Fire-and-forget. The handler writes one JSON line to stdout (Vercel logs) and returns `{ "ok": true }`. Phone numbers are masked to the last 4 digits. A call logged as `+1 (415) 555-0199` is stored as `*******0199`. The raw number is not logged.

```json
{ "request_type": "champion_build", "champion_name": "Ahri", "user_phone": "+14155550199" }
```

The nested `{ "args": { ... } }` shape is accepted too. Missing fields are logged as `(unspecified)` or `(none)` rather than failing the call.

### `GET /api/build?champion=NAME` and `POST /api/build`

Retell custom function: `get_champion_build`.

`GET /api/build?champion=Kai%27Sa` is the public URL. Retell does not let the model fill query parameters, so point the custom function at **POST** `/api/build` with a JSON body. Both methods return the same payload.

Roster: Ahri, Jinx, Yasuo, Lee Sin, Thresh, Lux, Darius, Kai'Sa, Ezreal, Ornn. Names are matched without case or punctuation (`leesin`, `Kai Sa`).

```json
{
  "champion": "Ahri",
  "core_items": ["Malignance", "Shadowflame", "Rabadon's Deathcap"],
  "runes": "Electrocute, with Manaflow Band, Transcendence, Scorch, and Presence of Mind.",
  "skill_order": "Max R whenever you can, then Q, then W, then E."
}
```

Unknown champion: `404` and the roster in the error message. Missing `champion`: `400`.

Item names are a curated snapshot. `npm run validate:items` (also part of `npm test`) fetches the current Data Dragon `item.json` and fails if any core item name is not an exact item name.

### `GET` and `POST /api/mcp`

Remote MCP server for Retell's MCP node. Streamable HTTP, stateless, built with `mcp-handler` and `@modelcontextprotocol/server`. Connect to:

```text
https://YOUR-APP.vercel.app/api/mcp
```

No Redis, no SSE path, no auth header. Tools:

| Tool | Arguments | Result |
| --- | --- | --- |
| `get_worlds_standings` | optional `year` (integer). Omit for the current or most recent Worlds. | `{ event, stage, standings: [{ team, place?, record? }], summary }` |
| `get_latest_patch` | none | `{ patch }` from Data Dragon, for example `{ "patch": "16.22.1" }` |
| `get_champion_info` | `champion` (string) | `{ champion, title, tags, blurb, abilities }` |

`summary` is one to three sentences meant to be spoken (top of the table, or the winner when a final or knockout stage is over). Standings come from one direct Leaguepedia Cargo query that joins `Tournaments` to `Standings` for `Worlds/<year>`. If the stage that is in progress has no table yet, the most recent earlier stage that does is returned. A `MatchSchedule` series record is requested only when that join has no standings at all. The request uses `User-Agent: RiftHerald/1.0 (League of Legends voice assistant; +https://github.com/akRetell/rift-herald-api)` and a 4 second timeout.

A successful table is cached for about an hour, and that last good table is kept if a later fetch fails. When Leaguepedia rate-limits or times out and nothing has been cached yet, the tool still returns 200-style JSON the agent can speak:

```json
{
  "event": "2026 World Championship",
  "stage": "unavailable",
  "standings": [],
  "summary": "Worlds standings are temporarily unavailable."
}
```

The live Worlds query was not verified from this environment. Leaguepedia answered `ratelimited` for `action=cargoquery` from this machine, and the call was not retried through a proxy. After deploy, confirm it with the query below (replace `2026` with the season you want). A fresh Vercel IP is not the IP that was throttled here.

```text
https://lol.fandom.com/api.php?action=cargoquery&format=json&tables=Tournaments%3DT%2CStandings%3DS&join_on=T.OverviewPage%3DS.OverviewPage&fields=T.OverviewPage%3DOverviewPage%2CT.Name%3DName%2CT.DateStart%3DDateStart%2CT.Date%3DDateEnd%2CT.Split%3DSplit%2CT.Year%3DYear%2CS.Team%3DTeam%2CS.Place%3DPlace%2CS.WinSeries%3DWinSeries%2CS.LossSeries%3DLossSeries&where=T.League%3D%22Worlds%22%20AND%20T.OverviewPage%20LIKE%20%22Worlds%2F2026%25%22&order_by=T.DateStart&limit=500
```

Readable form:

```text
action=cargoquery
format=json
tables=Tournaments=T,Standings=S
join_on=T.OverviewPage=S.OverviewPage
fields=T.OverviewPage=OverviewPage,T.Name=Name,T.DateStart=DateStart,T.Date=DateEnd,T.Split=Split,T.Year=Year,S.Team=Team,S.Place=Place,S.WinSeries=WinSeries,S.LossSeries=LossSeries
where=T.League="Worlds" AND T.OverviewPage LIKE "Worlds/2026%"
order_by=T.DateStart
limit=500
```

`get_champion_info` example for Lee Sin: title `the Blind Monk`, tags `Fighter` and `Assassin`, abilities `Flurry`, `Sonic Wave / Resonating Strike`, `Safeguard / Iron Will`, `Tempest / Cripple`, `Dragon's Rage`.

## Deploy on Vercel

1. Push this repo and import it at [vercel.com/new](https://vercel.com/new). Framework preset: **Next.js**. Root directory: the repo root. Build command and output directory: leave the defaults (`next build`).
2. Optional: set `RETELL_SHARED_SECRET` and, if you want signature checks, `RETELL_API_KEY`.
3. Deploy. The app URL looks like `https://rift-herald-api.vercel.app`. No `vercel.json`, no install flags, Node 20 or newer (Vercel's current Node 22 images are fine).

From the CLI, `npx vercel` in this directory does the same thing.

Replace `YOUR-APP` below with that hostname.

## Paste into Retell

Create a conversation-flow agent. For each custom function, set the timeout to `20000` (the log can stay at `5000`). Turn **Payload: args only** on or off; both body shapes work. If `RETELL_SHARED_SECRET` is set, add header `x-api-key` on every custom function. Do not add that header on the MCP server unless you terminate TLS in front of it; this app does not require it there.

Use **Wait for result** on patch notes, builds, and MCP tools. Use **Run in background** on `log_request`.

### Custom function `get_patch_notes`

- Method: `POST`
- URL: `https://YOUR-APP.vercel.app/api/patch-notes`
- Description: `Look up official League of Legends patch notes. Use when the caller asks what changed, who was buffed or nerfed, or what the latest patch did. Pass patch only if they named a version.`

Parameters:

```json
{
  "type": "object",
  "properties": {
    "patch": {
      "type": "string",
      "description": "Patch the caller asked about, such as 16.22.1, 16.22, 26.22, or 14.10. Omit this when they want the latest patch."
    }
  }
}
```

Response variables:

| Variable | Path |
| --- | --- |
| `patch_version` | `patch` |
| `patch_headline` | `headline` |
| `patch_url` | `url` |
| `first_buff` | `champion_buffs[0]` |
| `first_nerf` | `champion_nerfs[0]` |
| `first_system_change` | `system_changes[0]` |

The whole JSON body is also given to the model, so it can read the rest of each list. Speak `patch_headline` first, then up to a few buffs and nerfs, and offer the URL only if the caller wants to read.

### Custom function `log_request`

- Method: `POST`
- URL: `https://YOUR-APP.vercel.app/api/log`
- Description: `Record what the caller asked. Call this in the background after answering a League question. Never read the result aloud.`
- Execution: background / do not wait

Parameters:

```json
{
  "type": "object",
  "required": ["request_type", "champion_name", "user_phone"],
  "properties": {
    "request_type": {
      "type": "string",
      "description": "What the caller asked for: patch_notes, champion_build, worlds, champion_info, or other."
    },
    "champion_name": {
      "type": "string",
      "description": "Champion the caller named, or none if the question was not about a champion."
    },
    "user_phone": {
      "type": "string",
      "const": "{{user_number}}"
    }
  }
}
```

`{{user_number}}` is the usual inbound caller number. If your agent stores it under a different dynamic variable, put that name in `const` instead. No response variables. A successful call is `{ "ok": true }`.

### Custom function `get_champion_build`

- Method: `POST`
- URL: `https://YOUR-APP.vercel.app/api/build`
- Description: `Get a curated Summoner's Rift core build, rune page, and skill order. Only call this for Ahri, Darius, Ezreal, Jinx, Kai'Sa, Lee Sin, Lux, Ornn, Thresh, or Yasuo.`

Parameters:

```json
{
  "type": "object",
  "required": ["champion"],
  "properties": {
    "champion": {
      "type": "string",
      "description": "Champion to build. One of Ahri, Darius, Ezreal, Jinx, Kai'Sa, Lee Sin, Lux, Ornn, Thresh, Yasuo."
    }
  }
}
```

Response variables:

| Variable | Path |
| --- | --- |
| `build_champion` | `champion` |
| `build_runes` | `runes` |
| `build_skills` | `skill_order` |
| `core_item_1` | `core_items[0]` |
| `core_item_2` | `core_items[1]` |
| `core_item_3` | `core_items[2]` |

Direct checks can still use `GET https://YOUR-APP.vercel.app/api/build?champion=Ahri`.

### MCP node

1. Add an MCP server.
2. URL: `https://YOUR-APP.vercel.app/api/mcp`
3. Transport: the remote / Streamable HTTP server (not the legacy SSE `/sse` endpoint).
4. Headers: none. Query parameters: none.
5. Add these tools on the node. Set the node to wait for the result when the next line of dialogue depends on it.

`get_worlds_standings` — no parameters required. Optional parameter if the caller names a year: the tool schema already exposes `year`. Suggested response variables, if Retell maps the tool JSON:

| Variable | Path |
| --- | --- |
| `worlds_event` | `event` |
| `worlds_stage` | `stage` |
| `worlds_summary` | `summary` |

Speak `worlds_summary`. It already names the event, the stage, and the top teams.

`get_latest_patch` — no parameters. Response variable `latest_patch` → `patch`. This is the Data Dragon version (`16.22.1`), not the public article number (`26.22`). For spoken patch notes, call `get_patch_notes` instead.

`get_champion_info` — parameter schema is provided by the server:

```json
{
  "type": "object",
  "required": ["champion"],
  "properties": {
    "champion": {
      "type": "string",
      "description": "Champion name, such as Ahri, Lee Sin, or Kai'Sa."
    }
  }
}
```

| Variable | Path |
| --- | --- |
| `champion_title` | `title` |
| `champion_blurb` | `blurb` |

Tool results are JSON. The model can answer from the tool result even when you do not store response variables.
