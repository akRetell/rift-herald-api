import { NextResponse } from "next/server";
import { asString, readJsonBody, unwrapArgs } from "@/lib/args";
import { authEnvFromProcess, authorizeRequest } from "@/lib/auth";
import { getPatchNotes } from "@/lib/patch-service";
import { errorResponse } from "@/lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { raw, json } = await readJsonBody(request);
    authorizeRequest(request.headers, raw, authEnvFromProcess());
    const args = unwrapArgs(json);
    const notes = await getPatchNotes(asString(args.patch));
    return NextResponse.json(notes);
  } catch (error) {
    return errorResponse(error);
  }
}
