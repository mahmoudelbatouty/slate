import "server-only";

import { db, dbConfigured } from "@/db/client";

export interface ConnectorStatus {
  configured: boolean;
  platform: "sleeper";
  paired: boolean;
  state: "unconfigured" | "disconnected" | "waiting_for_data" | "connected";
  installationId: string | null;
  lastSeenAt: string | null;
  lastCaptureAt: string | null;
}

export async function getConnectorStatus(): Promise<ConnectorStatus> {
  if (!dbConfigured()) {
    return {
      configured: false,
      platform: "sleeper",
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
    .eq("platform", "sleeper")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`connector status: ${error.message}`);
  if (!installation) {
    return {
      configured: true,
      platform: "sleeper",
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
    platform: "sleeper",
    paired: Boolean(capture),
    state: capture ? "connected" : "waiting_for_data",
    installationId: installation.id,
    lastSeenAt: installation.last_seen_at,
    lastCaptureAt: capture?.captured_at ?? null,
  };
}
