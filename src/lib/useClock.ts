"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

/**
 * A clock the renderer can subscribe to.
 *
 * Returns the current 30-second bucket, or null on the server. Bucketing
 * matters: getSnapshot has to return a stable value between real changes
 * or React re-renders forever, so this can't just hand back Date.now().
 *
 * Anything time-relative ("synced 2m ago", "Sunday 1:07 PM") depends on
 * the reader's clock and timezone, so it can't be server-rendered — but
 * it also shouldn't be a setState-in-effect cascade.
 */
export function useClock(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK_MS),
    () => null
  );
}
