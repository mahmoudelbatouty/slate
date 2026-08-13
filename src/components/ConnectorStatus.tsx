"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectorStatus as Status } from "@/lib/connector-status";

export function ConnectorStatus({ status }: { status: Status }) {
  const router = useRouter();
  const [pairing, setPairing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status.configured) return null;

  async function pair() {
    setPairing(true);
    setError(null);
    try {
      const response = await fetch("/api/connector/pair", { method: "POST" });
      const body = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !body.token) throw new Error(body.error ?? "Pairing failed");
      setToken(body.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  async function disconnect() {
    if (!status.installationId) return;
    setPairing(true);
    setError(null);
    try {
      const response = await fetch("/api/connector/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installationId: status.installationId }),
      });
      if (!response.ok) throw new Error("Disconnect failed");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Disconnect failed");
    } finally {
      setPairing(false);
    }
  }

  const timestamp = status.lastCaptureAt ?? status.lastSeenAt;
  return (
    <section className="mt-4 border border-ink-line bg-ink-raised px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono text-2xs tracking-[0.08em] text-bone">
            {status.paired ? "BROWSER CONNECTOR" : "CONNECT NATIVE DATA"}
          </p>
          <p className="mt-1 text-xs text-bone-dim">
            {status.paired
              ? timestamp
                ? `Approved fantasy data received ${new Date(timestamp).toLocaleString()}`
                : "Paired · open a signed-in fantasy site to sync"
              : "Use site-native projections without sharing platform passwords."}
          </p>
        </div>
        {!status.paired && !token ? (
          <button
            className="shrink-0 border border-ink-line px-3 py-2 text-xs text-bone focus-visible:outline-2 focus-visible:outline-amber"
            type="button"
            disabled={pairing}
            onClick={pair}
          >
            {pairing ? "PAIRING…" : "PAIR"}
          </button>
        ) : status.paired ? (
          <button
            className="shrink-0 border border-ink-line px-3 py-2 text-xs text-bone-dim focus-visible:outline-2 focus-visible:outline-amber"
            type="button"
            disabled={pairing}
            onClick={disconnect}
          >
            DISCONNECT
          </button>
        ) : null}
      </div>

      {token && (
        <div className="mt-3 border-t border-ink-line pt-3">
          <p className="text-xs text-bone-dim">
            Paste this one-time connector token into the Slate Connector popup. It is shown
            once and cannot read your dashboard or platform credentials.
          </p>
          <code className="mono mt-2 block break-all border border-ink-line bg-ink px-3 py-2 text-xs text-bone">
            {token}
          </code>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-flag">{error}</p>}
    </section>
  );
}
