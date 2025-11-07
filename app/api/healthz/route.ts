import { NextResponse } from "next/server";

export async function GET() {
  // Lightweight health endpoint used by Docker healthchecks
  // Keep it simple: do not block on DB or external services
  return NextResponse.json({ ok: true }, { status: 200 });
}

