"use client";

import { useEffect, useState } from "react";
import type { ConnectorStatus as Status } from "@/lib/connector-status";

interface PairingChallenge {
  challengeId: string;
  claimSecret: string;
  platform: "sleeper";
  dashboardOrigin: string;
  expiresAt: string;
}

interface PairingResult {
  type: "SLATE_PAIR_RESULT";
  requestId: string;
  ok: boolean;
  error?: string;
}

export function ConnectorStatus({ status }: { status: Status }) {
  const [pairing, setPairing] = useState(false);
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current.state !== "waiting_for_data") return;

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/connector/status", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as Status;
      setCurrent(next);
      if (next.state === "connected") window.clearInterval(interval);
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [current.state]);

  if (!current.configured) return null;

  async function pair() {
    setPairing(true);
    setError(null);
    try {
      const response = await fetch("/api/connector/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "sleeper" }),
      });
      const body = (await response.json()) as PairingChallenge & { error?: string };
      if (!response.ok || !body.challengeId || !body.claimSecret) {
        throw new Error(body.error ?? "Pairing failed");
      }

      await claimWithExtension(body);
      setCurrent((value) => ({
        ...value,
        state: "waiting_for_data",
        paired: false,
      }));
      await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  async function disconnect() {
    if (!current.installationId) return;
    setPairing(true);
    setError(null);
    try {
      const response = await fetch("/api/connector/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installationId: current.installationId }),
      });
      if (!response.ok) throw new Error("Disconnect failed");
      setCurrent({
        ...current,
        state: "disconnected",
        paired: false,
        installationId: null,
        lastSeenAt: null,
        lastCaptureAt: null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Disconnect failed");
    } finally {
      setPairing(false);
    }
  }

  async function refreshStatus() {
    const response = await fetch("/api/connector/status", { cache: "no-store" });
    if (!response.ok) return;
    setCurrent((await response.json()) as Status);
  }

  const timestamp = current.lastCaptureAt ?? current.lastSeenAt;
  const connected = current.state === "connected";
  const waiting = current.state === "waiting_for_data";

  return (
    <section className="mt-4 border border-ink-line bg-ink-raised px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono text-2xs tracking-[0.08em] text-bone">
            {connected ? "SLEEPER CONNECTED" : waiting ? "SLEEPER READY" : "CONNECT SLEEPER"}
          </p>
          <p className="mt-1 text-xs text-bone-dim">
            {connected
              ? timestamp
                ? `Approved fantasy data received ${new Date(timestamp).toLocaleString()}`
                : "Connected to approved Sleeper data"
              : waiting
                ? "League schedules sync automatically. Slate is waiting for Sleeper's private native fields."
                : "Use Sleeper's native projections without sharing your password."}
          </p>
        </div>
        {!current.installationId ? (
          <button
            className="shrink-0 border border-ink-line px-3 py-2 text-xs text-bone focus-visible:outline-2 focus-visible:outline-amber"
            type="button"
            disabled={pairing}
            onClick={pair}
          >
            {pairing ? "CONNECTING…" : "CONNECT"}
          </button>
        ) : (
          <button
            className="shrink-0 border border-ink-line px-3 py-2 text-xs text-bone-dim focus-visible:outline-2 focus-visible:outline-amber"
            type="button"
            disabled={pairing}
            onClick={disconnect}
          >
            DISCONNECT
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-flag">{error}</p>}
    </section>
  );
}

function claimWithExtension(challenge: PairingChallenge): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Slate Connector was not detected. Open its popup once, approve this dashboard, then try again."
        )
      );
    }, 8_000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent<unknown>) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const result = event.data as Partial<PairingResult> | null;
      if (result?.type !== "SLATE_PAIR_RESULT" || result.requestId !== requestId) return;
      cleanup();
      if (result.ok) resolve();
      else reject(new Error(result.error ?? "The connector could not claim this pairing."));
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: "SLATE_PAIR_REQUEST",
        requestId,
        ...challenge,
      },
      window.location.origin
    );
  });
}
