"use client";

import { useClock } from "@/lib/useClock";

/**
 * "synced 2m ago". Times are stored UTC; this is the only place they're
 * turned into something human, and it happens on the client because the
 * answer depends on the reader's clock.
 */
export function SyncedAt({
  iso,
  leagueCount,
}: {
  iso: string | null;
  leagueCount: number;
}) {
  const tick = useClock();
  const leagues = `${leagueCount} league${leagueCount === 1 ? "" : "s"}`;

  if (!iso) {
    return <Line>never synced · {leagues}</Line>;
  }

  // Before hydration there's no reliable clock, so show nothing rather
  // than a number that's about to change.
  const label = tick === null ? "…" : ago(new Date(iso));
  return (
    <Line>
      synced {label} · {leagues}
    </Line>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono mt-[7px] text-2xs tracking-[0.02em] text-bone-dim">{children}</div>
  );
}

function ago(then: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}
