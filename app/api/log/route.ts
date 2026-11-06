import { NextResponse } from "next/server";
import { asString, readJsonBody, unwrapArgs } from "@/lib/args";
import { authEnvFromProcess, authorizeRequest } from "@/lib/auth";
import { maskPhone } from "@/lib/phone";
import { errorResponse } from "@/lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { raw, json } = await readJsonBody(request);
    authorizeRequest(request.headers, raw, authEnvFromProcess());
    const args = unwrapArgs(json);
    const entry = {
      event: "log_request",
      request_type: clip(asString(args.request_type)) || "(unspecified)",
      champion_name: clip(asString(args.champion_name)) || "(none)",
      user_phone: maskPhone(asString(args.user_phone)),
      at: new Date().toISOString(),
    };
    console.log(JSON.stringify(entry));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function clip(value: string | undefined, max = 80): string {
  if (!value) return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
