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
  platform: "sleeper" | "espn";
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
  const [espnCurrent, setEspnCurrent] = useState(statuses.espn);
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

  useEffect(() => {
    if (espnCurrent.state !== "waiting_for_data") return;
    const interval = window.setInterval(async () => {
      const next = await fetchConnectorStatus("espn");
      if (!next) return;
      setEspnCurrent(next);
      if (next.state === "connected") window.clearInterval(interval);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [espnCurrent.state]);

  async function pair(platform: "sleeper" | "espn") {
    setPairing(true);
    setError(null);
    try {
      const response = await fetch("/api/connector/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const body = (await response.json()) as PairingChallenge & { error?: string };
      if (!response.ok || !body.challengeId || !body.claimSecret) {
        throw new Error(body.error ?? "Pairing failed");
      }
      await claimWithExtension(body);
      if (platform === "sleeper") {
        setCurrent((value) => ({ ...value, state: "waiting_for_data", paired: false }));
      } else {
        setEspnCurrent((value) => ({ ...value, state: "waiting_for_data", paired: false }));
      }
      await refreshStatus(platform);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  async function refreshStatus(platform: "sleeper" | "espn") {
    const next = await fetchConnectorStatus(platform);
    if (!next) return;
    if (platform === "sleeper") setCurrent(next);
    else setEspnCurrent(next);
  }

  const sleeperState = current.state === "connected"
    ? "connected"
    : current.state === "waiting_for_data"
      ? "ready"
      : "not connected";
  const message = error ?? connectionNotice(notice);

  return (
    <section className="relative w-[142px] border border-ink-line bg-ink-raised" aria-label="Platform login">
      <p className="mono border-b border-ink-line px-2 py-1.5 text-center text-[9px] tracking-[0.16em] text-bone">LOGIN</p>
      <div className="grid grid-cols-3 divide-x divide-ink-line">
        {!current.installationId ? (
          <button
            className="inline-flex h-10 items-center justify-center opacity-70 transition-opacity hover:bg-ink hover:opacity-100 focus-visible:outline-2 focus-visible:outline-amber disabled:cursor-wait"
            type="button"
            disabled={pairing}
            onClick={() => pair("sleeper")}
            aria-label={`Sleeper ${sleeperState}. ${pairing ? "Connecting" : "Connect Sleeper"}.`}
            title={pairing ? "Connecting Sleeper" : "Connect Sleeper"}
          >
            <PlatformMark platform="sleeper" variant="login" />
          </button>
        ) : (
          <span
            className="inline-flex h-10 items-center justify-center bg-ink/25"
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
        {!espnCurrent.installationId ? (
          <button
            className="inline-flex h-10 items-center justify-center opacity-70 transition-opacity hover:bg-ink hover:opacity-100 focus-visible:outline-2 focus-visible:outline-amber disabled:cursor-wait"
            type="button"
            disabled={pairing}
            onClick={() => pair("espn")}
            aria-label={`ESPN ${espnCurrent.state === "disconnected" ? "not connected" : "ready"}. ${pairing ? "Connecting" : "Connect ESPN"}.`}
            title={pairing ? "Connecting ESPN" : "Connect ESPN"}
          >
            <PlatformMark platform="espn" variant="login" />
          </button>
        ) : (
          <span className="inline-flex h-10 items-center justify-center bg-ink/25" aria-label={`ESPN ${espnCurrent.state}`} title={`ESPN ${espnCurrent.state}`}>
            <PlatformMark platform="espn" variant="login" />
          </span>
        )}
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

async function fetchConnectorStatus(platform: "sleeper" | "espn"): Promise<Status | null> {
  const response = await fetch(`/api/connector/status?platform=${platform}`, { cache: "no-store" });
  return response.ok ? await response.json() as Status : null;
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
  const className = `inline-flex h-10 items-center justify-center transition-opacity focus-visible:outline-2 focus-visible:outline-amber ${href ? "opacity-70 hover:bg-ink hover:opacity-100" : "bg-ink/25 opacity-45"}`;

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
    case "yahoo-connected": return "Yahoo connected. Your leagues are synced.";
    case "yahoo-sync-pending": return "Yahoo connected. League sync will retry automatically.";
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
