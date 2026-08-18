import "server-only";

import { db, dbConfigured } from "@/db/client";

export interface ConnectorStatus {
  configured: boolean;
  platform: "sleeper" | "espn";
  paired: boolean;
  state: "unconfigured" | "disconnected" | "waiting_for_data" | "connected";
  installationId: string | null;
  lastSeenAt: string | null;
  lastCaptureAt: string | null;
}

export interface PlatformConnectionStatuses {
  sleeper: ConnectorStatus;
  yahoo: { configured: boolean; connected: boolean; lastOkAt: string | null };
  espn: ConnectorStatus;
}

export async function getPlatformConnectionStatuses(): Promise<PlatformConnectionStatuses> {
  const [sleeper, espn] = await Promise.all([
    getConnectorStatus("sleeper"),
    getConnectorStatus("espn"),
  ]);
  const yahooConfigured = Boolean(
    process.env.YAHOO_CLIENT_ID
      && process.env.YAHOO_CLIENT_SECRET
      && process.env.YAHOO_REDIRECT_URI
      && process.env.PLATFORM_TOKEN_ENCRYPTION_KEY
  );
  let yahooAccount: { last_ok_at: string | null } | null = null;
  if (dbConfigured()) {
    const { data, error } = await db()
      .from("platform_accounts")
      .select("last_ok_at")
      .eq("platform", "yahoo")
      .maybeSingle();
    if (error) throw new Error(`Yahoo connection status: ${error.message}`);
    yahooAccount = data;
  }
  return {
    sleeper,
    yahoo: {
      configured: yahooConfigured,
      connected: yahooConfigured && Boolean(yahooAccount?.last_ok_at),
      lastOkAt: yahooAccount?.last_ok_at ?? null,
    },
    espn,
  };
}

export async function getConnectorStatus(platform: "sleeper" | "espn" = "sleeper"): Promise<ConnectorStatus> {
  if (!dbConfigured()) {
    return {
      configured: false,
      platform,
      paired: false,
      state: "unconfigured",
      installationId: null,
      lastSeenAt: null,
      lastCaptureAt: null,
    };
  }

  const client = db();
  const { data: installation, error } = await client
    .from("connector_installations")
    .select("id, last_seen_at")
    .eq("platform", platform)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`connector status: ${error.message}`);
  if (!installation) {
    return {
      configured: true,
      platform,
      paired: false,
      state: "disconnected",
      installationId: null,
      lastSeenAt: null,
      lastCaptureAt: null,
    };
  }

  const { data: capture, error: captureError } = await client
    .from("connector_captures")
    .select("captured_at")
    .eq("installation_id", installation.id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (captureError) throw new Error(`connector capture status: ${captureError.message}`);

  return {
    configured: true,
    platform,
    paired: Boolean(capture),
    state: capture ? "connected" : "waiting_for_data",
    installationId: installation.id,
    lastSeenAt: installation.last_seen_at,
    lastCaptureAt: capture?.captured_at ?? null,
  };
}
