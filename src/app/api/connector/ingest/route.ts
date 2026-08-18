import { dbConfigured, db } from "@/db/client";
import { connectorEnvelope, type ConnectorEnvelope } from "@/connector/protocol";
import { storeConnectorCapture } from "@/connector/store";
import { bearerToken, hashConnectorToken } from "@/lib/connector-auth";
import {
  IDLE_POLL_MS,
  isLiveSyncWindow,
  LIVE_SYNC_MIN_GAP_MS,
  type LiveGame,
} from "@/lib/live-refresh";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  if (!dbConfigured()) return json({ error: "Not configured" }, 503);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 256_000) return json({ error: "Payload too large" }, 413);

  const token = bearerToken(request);
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { data: installation, error: authError } = await db()
    .from("connector_installations")
    .select("id, platform")
    .eq("token_hash", hashConnectorToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (authError || !installation) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = connectorEnvelope.safeParse(body);
  if (!parsed.success) return json({ error: "Unsupported connector payload" }, 422);
  if (installation.platform !== parsed.data.platform) {
    return json({ error: "Connector token cannot ingest this platform" }, 403);
  }

  try {
    const result = await storeConnectorCapture(installation.id, parsed.data);
    const nextRefreshMs = parsed.data.platform === "espn"
      ? await espnRefreshDelay(parsed.data).catch(() => IDLE_POLL_MS)
      : undefined;
    return json({ ok: true, ...result, nextRefreshMs }, 200);
  } catch {
    return json({ error: "Capture could not be stored" }, 500);
  }
}

async function espnRefreshDelay(
  envelope: Extract<ConnectorEnvelope, { platform: "espn" }>
): Promise<number> {
  const playable = envelope.snapshots.filter((snapshot) => snapshot.status === "in_season");
  if (!playable.length) return IDLE_POLL_MS;
  const season = Math.max(...playable.map((snapshot) => snapshot.season));
  const week = Math.max(
    ...playable
      .filter((snapshot) => snapshot.season === season)
      .map((snapshot) => snapshot.currentWeek)
  );
  const { data, error } = await db()
    .from("nfl_games")
    .select("start_time, is_over, in_progress, canceled")
    .eq("season", season)
    .eq("week", week);
  if (error) return IDLE_POLL_MS;
  return isLiveSyncWindow((data ?? []) as LiveGame[])
    ? LIVE_SYNC_MIN_GAP_MS
    : IDLE_POLL_MS;
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: CORS });
}
