import { NextResponse } from "next/server";
import { asString, readJsonBody, unwrapArgs } from "@/lib/args";
import { authEnvFromProcess, authorizeRequest } from "@/lib/auth";
import { getChampionBuild } from "@/lib/builds";
import { BadRequestError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    authorizeRequest(request.headers, "", authEnvFromProcess());
    const champion = new URL(request.url).searchParams.get("champion") ?? undefined;
    return jsonBuild(champion);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { raw, json } = await readJsonBody(request);
    authorizeRequest(request.headers, raw, authEnvFromProcess());
    const args = unwrapArgs(json);
    return jsonBuild(asString(args.champion));
  } catch (error) {
    return errorResponse(error);
  }
}

function jsonBuild(champion: string | undefined): NextResponse {
  if (!champion) {
    throw new BadRequestError("Pass a champion name, for example ?champion=Ahri.");
  }
  return NextResponse.json(getChampionBuild(champion), {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
