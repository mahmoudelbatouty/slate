"use client";

import { useCallback, useEffect, useState } from "react";
import { startPairing } from "@/lib/connector-pairing";
import type { ConnectorStatus, PlatformConnectionStatuses } from "@/lib/connector-status";
import type { Platform } from "@/lib/matchup";

export interface Connections {
  statuses: PlatformConnectionStatuses;
  isConnected: (platform: Platform) => boolean;
  /** The platform whose handshake is in flight, if any. */
  pairing: Platform | null;
  connect: (platform: Platform) => void;
}

/**
 * Connecting a platform is one action with two entry points — the provider
 * marks in the header and the rows in the account sheet — so it lives here
 * rather than inside either surface. Both call `connect` from a click handler,
 * which is what it is: an event, not state to synchronize.
 */
export function useConnections(
  initial: PlatformConnectionStatuses,
  onToast: (message: string) => void
): Connections {
  const [sleeper, setSleeper] = useState(initial.sleeper);
  const [espn, setEspn] = useState(initial.espn);
  const [pairing, setPairing] = useState<Platform | null>(null);

  useWaitingForData(sleeper, setSleeper);
  useWaitingForData(espn, setEspn);

  const statuses: PlatformConnectionStatuses = { sleeper, espn, yahoo: initial.yahoo };

  const isConnected = useCallback(
    (platform: Platform) =>
      platform === "yahoo"
        ? initial.yahoo.connected
        : (platform === "sleeper" ? sleeper : espn).state === "connected",
    [initial.yahoo.connected, sleeper, espn]
  );

  const connect = useCallback(
    (platform: Platform) => {
      if (platform === "yahoo") {
        // Yahoo's start route is a server redirect out to Yahoo's consent
        // screen, so this has to leave the app rather than route inside it.
        if (!initial.yahoo.connected && initial.yahoo.configured) {
          window.location.assign(new URL("/api/auth/yahoo/start", window.location.origin));
        }
        return;
      }
      if ((platform === "sleeper" ? sleeper : espn).state === "connected") return;

      setPairing(platform);
      void (async () => {
        try {
          await startPairing(platform);
          const next = await fetchConnectorStatus(platform);
          if (next) {
            if (platform === "sleeper") setSleeper(next);
            else setEspn(next);
          }
          onToast(`${title(platform)} pairing approved. Slate is waiting for its first sync.`);
        } catch (cause) {
          onToast(cause instanceof Error ? cause.message : "Pairing failed.");
        } finally {
          setPairing(null);
        }
      })();
    },
    [initial.yahoo, sleeper, espn, onToast]
  );

  return { statuses, isConnected, pairing, connect };
}

/** Polls only while a fresh pairing has yet to deliver its first capture. */
function useWaitingForData(status: ConnectorStatus, setStatus: (next: ConnectorStatus) => void) {
  useEffect(() => {
    if (status.state !== "waiting_for_data") return;
    const interval = window.setInterval(async () => {
      const next = await fetchConnectorStatus(status.platform);
      if (!next) return;
      setStatus(next);
      if (next.state === "connected") window.clearInterval(interval);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [status.state, status.platform, setStatus]);
}

async function fetchConnectorStatus(platform: "sleeper" | "espn"): Promise<ConnectorStatus | null> {
  const response = await fetch(`/api/connector/status?platform=${platform}`, { cache: "no-store" });
  return response.ok ? ((await response.json()) as ConnectorStatus) : null;
}

export function title(platform: Platform): string {
  return platform === "espn" ? "ESPN" : platform === "yahoo" ? "Yahoo" : "Sleeper";
}
