"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IDLE_POLL_MS, LIVE_POLL_MS } from "@/lib/live-refresh";

type RefreshState = "checking" | "idle" | "live" | "retrying";

interface LiveResponse {
  state: "idle" | "current" | "synced";
  live: boolean;
  nextPollMs?: number;
}

export function LiveRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("checking");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let running = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(check, delay);
    };

    const check = async () => {
      if (stopped || running || document.visibilityState === "hidden") {
        schedule(IDLE_POLL_MS);
        return;
      }

      running = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/live/sync", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("dashboard sync failed");

        const result = (await response.json()) as LiveResponse;
        setState(result.live ? "live" : "idle");
        if (result.state === "synced") {
          startTransition(() => router.refresh());
        }
        schedule(result.nextPollMs ?? (result.live ? LIVE_POLL_MS : IDLE_POLL_MS));
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) {
          setState("retrying");
          schedule(LIVE_POLL_MS);
        }
      } finally {
        running = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    schedule(0);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [enabled, router]);

  if (!enabled) return null;

  return (
    <span
      className="mono text-[calc(9px*var(--ui-scale))] tracking-[0.08em] text-stone"
      aria-live="polite"
      title="Slate checks leagues and rosters every five minutes, and live scores every minute during active games. ESPN background sync requires Chromium to be open and signed into ESPN."
    >
      {state === "live"
        ? "LIVE SYNC ON"
        : state === "retrying"
          ? "SYNC RETRYING"
          : state === "idle"
            ? "AUTO SYNC READY"
            : "SYNC CHECKING"}
    </span>
  );
}
