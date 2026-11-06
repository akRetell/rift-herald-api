import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getChampionInfo, getLatestVersion } from "@/lib/ddragon-service";
import { getWorldsStandings } from "@/lib/worlds-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_worlds_standings",
      {
        title: "Worlds standings",
        description:
          "Current or most recent League of Legends World Championship standings from Leaguepedia. Returns the event, stage, a short table, and a spoken summary.",
        inputSchema: z.object({
          year: z
            .number()
            .int()
            .optional()
            .describe("Worlds year, such as 2026. Omit this for the current or most recent event."),
        }),
      },
      async ({ year }) => toolJson(() => getWorldsStandings(year)),
    );

    server.registerTool(
      "get_latest_patch",
      {
        title: "Latest patch",
        description: "The latest League of Legends patch version from Data Dragon, such as 16.22.1.",
        inputSchema: z.object({}),
      },
      async () => toolJson(async () => ({ patch: await getLatestVersion() })),
    );

    server.registerTool(
      "get_champion_info",
      {
        title: "Champion info",
        description:
          "Title, role tags, a short blurb, and ability names for a League of Legends champion from Data Dragon.",
        inputSchema: z.object({
          champion: z.string().describe("Champion name, such as Ahri, Lee Sin, or Kai'Sa."),
        }),
      },
      async ({ champion }) => toolJson(() => getChampionInfo(champion)),
    );
  },
  {
    serverInfo: { name: "rift-herald", version: "1.0.0" },
    instructions:
      "Rift Herald tools for a League of Legends voice agent: Worlds standings, the latest Data Dragon patch, and champion identity.",
  },
);

async function toolJson(work: () => Promise<unknown>) {
  try {
    const data = await work();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed.";
    console.error(error);
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true as const,
    };
  }
}

export { handler as GET, handler as POST };
