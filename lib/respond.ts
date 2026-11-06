import { NextResponse } from "next/server";
import { HttpError } from "./errors";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}
