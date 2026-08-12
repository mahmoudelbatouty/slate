"use client";

import { useClock } from "@/lib/useClock";

/**
 * The weekday and clock in the header. Client-side because "Sunday" and
 * "1:07 PM" are properties of the reader's timezone, not the server's.
 */
export function Today({ week }: { week: number | null }) {
  const tick = useClock();
  const now = tick === null ? null : new Date();

  const day = now ? now.toLocaleDateString(undefined, { weekday: "long" }) : "Slate";
  const time = now
    ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="flex items-baseline justify-between gap-3">
      <h1 className="display text-[34px] leading-none">{day}</h1>
      <div className="mono text-[13px] tracking-[0.06em] text-bone-dim">
        {week ? `WEEK ${week}` : "OFF SEASON"}
        {time && ` · ${time}`}
      </div>
    </div>
  );
}
