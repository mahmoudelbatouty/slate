"use client";

import { useClock } from "@/lib/useClock";

/**
 * Header line: the week you're looking at, big, because that's what the
 * filter changes. The weekday and clock sit in the small slot — useful
 * context at 1pm on a Sunday, noise on a Wednesday in August, and never
 * worth the hero position either way.
 */
export function Today({
  week,
  context,
}: {
  week: number | null;
  context: "preseason" | "current" | "past" | "upcoming";
}) {
  const tick = useClock();
  const now = tick === null ? null : new Date();

  const day = now
    ? now.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()
    : "";
  const time = now
    ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="flex items-baseline justify-between gap-3">
      <h1 className="display text-[34px] leading-none">
        {week ? `Week ${week}` : "Preseason"}
      </h1>
      <div className="mono shrink-0 text-[13px] tracking-[0.06em] text-bone-dim">
        {context === "past" ? "PAST" : context === "upcoming" ? "UPCOMING" : day}
        {time && ` · ${time}`}
      </div>
    </div>
  );
}
