import { ROSTER } from "@/lib/builds";

export default function HomePage() {
  return (
    <main>
      <h1>Rift Herald</h1>
      <p className="lede">
        A small League of Legends info API for a Retell conversation-flow voice agent. No database
        and no keyed upstream APIs.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/patch-notes</code> — official patch notes summary
        </li>
        <li>
          <code>POST /api/log</code> — masked call log for Vercel logs
        </li>
        <li>
          <code>GET /api/build?champion=Ahri</code> — curated build for {ROSTER.length} champions
        </li>
        <li>
          <code>POST /api/mcp</code> — Streamable HTTP MCP server (Worlds, latest patch, champion
          info)
        </li>
      </ul>
      <p>
        Setup for Retell, including the JSON schemas to paste in, is in the README.
      </p>
    </main>
  );
}
