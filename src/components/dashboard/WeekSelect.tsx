"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { WeekOption } from "@/lib/weeks";

/**
 * Always-visible week selection. A native `<select>` on purpose — it keeps the
 * platform picker on phones, stays keyboard-navigable, and selecting a week is
 * still a navigation, so the page below it remains a pure server read.
 */
export function WeekSelect({
  weeks,
  selected,
  liveState,
}: {
  weeks: WeekOption[];
  selected: number | null;
  liveState: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-[9px] border-b border-ink-line bg-deep px-[18px] pb-[14px]">
      <span className="mono shrink-0 text-[9.5px] tracking-[0.13em] text-stone">SEASON WEEK</span>
      <div className="relative flex items-center">
        <select
          aria-label="Fantasy week"
          className="week-select mono cursor-pointer rounded-[3px] border border-ink-line bg-ink-raised py-[7px] pr-[30px] pl-[11px] text-[10.5px] tracking-[0.06em] text-bone"
          value={selected ?? ""}
          disabled={pending}
          onChange={(event) => {
            const week = Number(event.target.value);
            const option = weeks.find((entry) => entry.week === week);
            startTransition(() => {
              router.push(option?.isCurrent ? "/" : `/?week=${week}`, { scroll: false });
            });
          }}
        >
          {selected === null && <option value="">PRESEASON</option>}
          {weeks.map((option) => (
            <option key={option.week} value={option.week}>
              WEEK {option.week}
              {option.isCurrent ? " · CURRENT" : ""}
            </option>
          ))}
        </select>
        <span className="mono pointer-events-none absolute right-[11px] text-[9px] text-stone" aria-hidden>
          ▼
        </span>
      </div>
      <span className="mono text-[9.5px] tracking-[0.1em] text-stone">
        {pending ? "LOADING…" : liveState}
      </span>
    </div>
  );
}
