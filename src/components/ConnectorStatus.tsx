"use client";

import { useEffect, useState } from "react";
import type { ConnectorStatus as Status, PlatformConnectionStatuses } from "@/lib/connector-status";
import { PlatformMark } from "@/components/PlatformMark";

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

export function ConnectorStatus({
  statuses,
  notice,
}: {
  statuses: PlatformConnectionStatuses;
  notice?: string;
}) {
  const status = statuses.sleeper;
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
    <section className="mt-4 border border-ink-line bg-ink-raised px-4 py-4" aria-label="Platform connections">
      <div className="mb-3">
        <p className="mono text-2xs tracking-[0.1em] text-bone">PLATFORM CONNECTIONS</p>
        <p className="mt-1 text-xs text-bone-dim">Choose a platform. Passwords always stay with the provider.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="border border-ink-line p-3">
          <div className="mb-3 flex min-h-6 items-center"><PlatformMark platform="sleeper" /></div>
          <div className="flex items-end justify-between gap-2 sm:block">
        <div>
          <p className="mono text-2xs tracking-[0.08em] text-bone">
            {connected ? "CONNECTED" : waiting ? "READY" : "NOT CONNECTED"}
          </p>
          <p className="mt-1 text-xs text-bone-dim sm:min-h-[72px]">
            {connected
              ? timestamp
                ? `Approved fantasy data received ${new Date(timestamp).toLocaleString()}`
                : "Connected to approved Sleeper data"
              : waiting
                ? "Schedules, scores, and Sleeper projections sync automatically. Connection is ready for provider-only features."
                : "Connect approved fantasy data without sharing your password."}
          </p>
        </div>
        {!current.installationId ? (
          <button
            className="shrink-0 border border-ink-line px-3 py-2 text-xs text-bone focus-visible:outline-2 focus-visible:outline-amber sm:mt-3"
            type="button"
            disabled={pairing}
            onClick={pair}
          >
            {pairing ? "CONNECTING…" : "CONNECT"}
          </button>
        ) : (
          <button
            className="shrink-0 border border-ink-line px-3 py-2 text-xs text-bone-dim focus-visible:outline-2 focus-visible:outline-amber sm:mt-3"
            type="button"
            disabled={pairing}
            onClick={disconnect}
          >
            DISCONNECT
          </button>
        )}
          </div>
        </div>

        <ProviderTile
          platform="yahoo"
          state={statuses.yahoo.connected ? "CONNECTED" : statuses.yahoo.configured ? "NOT CONNECTED" : "SETUP NEEDED"}
          detail={statuses.yahoo.connected
            ? "Yahoo Fantasy access approved."
            : statuses.yahoo.configured
              ? "Sign in and approve Fantasy access on Yahoo."
              : "Developer credentials and encryption key are required."}
          href={statuses.yahoo.configured && !statuses.yahoo.connected ? "/api/auth/yahoo/start" : undefined}
        />
        <ProviderTile
          platform="espn"
          state="COMING NEXT"
          detail="Will use the same password-free connector pattern."
        />
      </div>

      {(error || connectionNotice(notice)) ? (
        <p className={`mt-3 text-xs ${error || notice === "yahoo-error" || notice === "yahoo-invalid-state" ? "text-flag" : "text-bone-dim"}`} role="status">
          {error ?? connectionNotice(notice)}
        </p>
      ) : null}
    </section>
  );
}

function ProviderTile({ platform, state, detail, href }: {
  platform: "yahoo" | "espn";
  state: string;
  detail: string;
  href?: string;
}) {
  return (
    <div className="border border-ink-line p-3">
      <div className="mb-3 flex min-h-6 items-center"><PlatformMark platform={platform} /></div>
      <p className="mono text-2xs tracking-[0.08em] text-bone">{state}</p>
      <p className="mt-1 text-xs text-bone-dim sm:min-h-[72px]">{detail}</p>
      {href ? (
        <a className="mt-3 inline-block border border-ink-line px-3 py-2 text-xs text-bone focus-visible:outline-2 focus-visible:outline-amber" href={href}>CONNECT</a>
      ) : null}
    </div>
  );
}

function connectionNotice(notice: string | undefined): string | null {
  switch (notice) {
    case "yahoo-connected": return "Yahoo connected. League import is the next step.";
    case "yahoo-cancelled": return "Yahoo connection was cancelled.";
    case "yahoo-invalid-state": return "Yahoo connection expired. Please try again.";
    case "yahoo-missing-code":
    case "yahoo-error": return "Yahoo could not be connected. No password or token was retained.";
    case "yahoo-setup-needed": return "Yahoo setup needs developer credentials and a token-encryption key.";
    default: return null;
  }
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
