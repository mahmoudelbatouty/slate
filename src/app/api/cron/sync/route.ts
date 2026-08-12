import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { runSync, type SyncMode } from "@/sync/run";
import { safeEqual } from "@/lib/auth";

// Sync talks to live platform APIs and writes Postgres. Never cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODES: SyncMode[] = ["live", "daily", "players"];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends the secret as a bearer token.
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(token, secret);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("mode") ?? "live";
  if (!MODES.includes(raw as SyncMode)) {
    return NextResponse.json(
      { error: `mode must be one of ${MODES.join(", ")}` },
      { status: 400 }
    );
  }
  const mode = raw as SyncMode;

  const season = Number(
    req.nextUrl.searchParams.get("season") ?? process.env.DEFAULT_SEASON ?? 2026
  );

  const results = await runSync(db(), mode, season);
  const failed = results.some((r) => r.status === "error");

  // 207 when some platform broke but others succeeded — the whole point
  // of the containment in runSync is that this isn't a 500.
  return NextResponse.json(
    { mode, season, results },
    { status: failed ? 207 : 200 }
  );
}
