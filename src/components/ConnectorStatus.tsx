"use client";

import { useEffect, useState } from "react";
import { PlatformMark } from "@/components/PlatformMark";
import type {
  ConnectorStatus as Status,
  PlatformConnectionStatuses,
} from "@/lib/connector-status";

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
  const [pairing, setPairing] = useState(false);
  const [current, setCurrent] = useState(statuses.sleeper);
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
      setCurrent((value) => ({ ...value, state: "waiting_for_data", paired: false }));
      await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  async function refreshStatus() {
    const response = await fetch("/api/connector/status", { cache: "no-store" });
    if (!response.ok) return;
    setCurrent((await response.json()) as Status);
  }

  const sleeperState = current.state === "connected"
    ? "connected"
    : current.state === "waiting_for_data"
      ? "ready"
      : "not connected";
  const message = error ?? connectionNotice(notice);

  return (
    <section className="relative w-[166px] border border-ink-line bg-ink-raised px-2 py-1.5" aria-label="Platform login">
      <p className="mono text-[9px] tracking-[0.12em] text-bone">LOGIN</p>
      <div className="mt-0.5 flex items-center justify-between">
        {!current.installationId ? (
          <button
            className="inline-flex min-h-10 min-w-11 items-center justify-center opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-amber disabled:cursor-wait"
            type="button"
            disabled={pairing}
            onClick={pair}
            aria-label={`Sleeper ${sleeperState}. ${pairing ? "Connecting" : "Connect Sleeper"}.`}
            title={pairing ? "Connecting Sleeper" : "Connect Sleeper"}
          >
            <PlatformMark platform="sleeper" variant="login" />
          </button>
        ) : (
          <span
            className="inline-flex min-h-10 min-w-11 items-center justify-center"
            aria-label={`Sleeper ${sleeperState}`}
            title={`Sleeper ${sleeperState}`}
          >
            <PlatformMark platform="sleeper" variant="login" />
          </span>
        )}

        <ProviderLogo
          platform="yahoo"
          state={statuses.yahoo.connected
            ? "connected"
            : statuses.yahoo.configured
              ? "not connected"
              : "setup needed"}
          href={statuses.yahoo.configured && !statuses.yahoo.connected
            ? "/api/auth/yahoo/start"
            : undefined}
        />
        <ProviderLogo platform="espn" state="coming next" />
      </div>

      {message ? (
        <p
          className={`absolute top-[calc(100%+6px)] right-0 z-30 w-[250px] border border-ink-line bg-ink-raised px-3 py-2 text-xs shadow-lg ${error || notice === "yahoo-error" || notice === "yahoo-invalid-state" ? "text-flag" : "text-bone-dim"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function ProviderLogo({
  platform,
  state,
  href,
}: {
  platform: "yahoo" | "espn";
  state: string;
  href?: string;
}) {
  const provider = platform === "espn" ? "ESPN" : "Yahoo";
  const label = `${provider} ${state}`;
  const className = `inline-flex min-h-10 min-w-11 items-center justify-center transition-opacity focus-visible:outline-2 focus-visible:outline-amber ${href ? "opacity-70 hover:opacity-100" : "opacity-45"}`;

  return href ? (
    <a className={className} href={href} aria-label={`${label}. Connect.`} title={`Connect ${provider}`}>
      <PlatformMark platform={platform} variant="login" />
    </a>
  ) : (
    <span className={className} aria-label={label} title={label}>
      <PlatformMark platform={platform} variant="login" />
    </span>
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
      reject(new Error("Slate Connector was not detected. Open its popup once, approve this dashboard, then try again."));
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
    window.postMessage({ type: "SLATE_PAIR_REQUEST", requestId, ...challenge }, window.location.origin);
  });
}
