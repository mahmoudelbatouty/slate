import Link from "next/link";
import type { WeekOption } from "@/lib/dashboard";

/**
 * Week filter. Plain links, not a client component — selecting a week is
 * a navigation, the page is a pure read from Postgres, and this keeps the
 * whole dashboard server-rendered.
 *
 * Weeks with nothing synced stay selectable but read as inert: they show
 * an empty state, which is more useful than pretending they don't exist.
 */
export function WeekPicker({
  weeks,
  selected,
}: {
  weeks: WeekOption[];
  selected: number | null;
}) {
  if (weeks.length <= 1) return null;

  return (
    <nav
      aria-label="Week"
      className="-mx-[18px] mt-3 flex gap-1 overflow-x-auto px-[18px] pb-1"
    >
      {weeks.map((option) => {
        const isSelected = option.week === selected;

        // Selected is the only state carrying a border — this row must not
        // spend any of the amber budget, which belongs to live games.
        const tone = isSelected
          ? "border-bone text-bone"
          : option.hasData
            ? "border-ink-line text-bone-dim"
            : "border-ink-line/60 text-stone";

        return (
          <Link
            key={option.week}
            href={option.isCurrent ? "/" : `/?week=${option.week}`}
            scroll={false}
            aria-current={isSelected ? "page" : undefined}
            title={option.hasData ? undefined : `Week ${option.week} — not synced`}
            className={`mono shrink-0 border px-[9px] py-[5px] text-2xs tabular-nums ${tone}`}
          >
            {option.week}
            {option.isCurrent && <span aria-hidden> ·</span>}
          </Link>
        );
      })}
    </nav>
  );
}
