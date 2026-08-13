import "server-only";

import { db, dbConfigured } from "@/db/client";

export interface ConnectorStatus {
  configured: boolean;
  paired: boolean;
  installationId: string | null;
  lastSeenAt: string | null;
  lastCaptureAt: string | null;
}

export async function getConnectorStatus(): Promise<ConnectorStatus> {
  if (!dbConfigured()) {
    return {
      configured: false,
      paired: false,
      installationId: null,
      lastSeenAt: null,
      lastCaptureAt: null,
    };
  }

  const client = db();
  const { data: installation, error } = await client
    .from("connector_installations")
    .select("id, last_seen_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`connector status: ${error.message}`);
  if (!installation) {
    return {
      configured: true,
      paired: false,
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
    paired: true,
    installationId: installation.id,
    lastSeenAt: installation.last_seen_at,
    lastCaptureAt: capture?.captured_at ?? null,
  };
}
