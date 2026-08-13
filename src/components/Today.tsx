"use client";

import { useClock } from "@/lib/useClock";

/** The selected fantasy week is the header's primary context. */
export function Today({
  week,
}: {
  week: number | null;
}) {
  return (
    <h1 className="display text-[34px] leading-none">
      {week ? `Week ${week}` : "Preseason"}
    </h1>
  );
}

export function TodayContext({
  context,
}: {
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
    <div className="mono shrink-0 text-[11px] tracking-[0.06em] text-bone-dim">
      {context === "past" ? "PAST" : context === "upcoming" ? "UPCOMING" : day}
      {time && ` · ${time}`}
    </div>
  );
}
