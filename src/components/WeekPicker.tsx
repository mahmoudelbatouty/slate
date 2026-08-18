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
  return (
    <div className="-mx-[18px] mt-3 border-t border-ink-line/70 pt-2">
      <div className="mb-1 flex items-center justify-between px-[18px]">
        <span className="mono text-[9px] tracking-[0.12em] text-bone-dim">SEASON WEEKS</span>
        <span className="mono text-[9px] tracking-[0.08em] text-stone">SWIPE TO BROWSE</span>
      </div>
      <nav
        aria-label="Fantasy week"
        className="week-rail flex gap-1 overflow-x-auto px-[18px] pb-1"
      >
        {weeks.map((option) => {
          const isSelected = option.week === selected;
          const syncState = option.hasData ? "SYNCED" : "UNSYNCED";
          const state = option.isCurrent ? `CURRENT · ${syncState}` : syncState;

          return (
            <WeekLink
              key={option.week}
              href={option.isCurrent ? "/" : `/?week=${option.week}`}
              label={`W${option.week}`}
              state={state}
              selected={isSelected}
              available={option.hasData}
            />
          );
        })}
      </nav>
    </div>
  );
}

function WeekLink({
  href,
  label,
  state,
  selected,
  available = false,
}: {
  href: string;
  label: string;
  state: string;
  selected: boolean;
  available?: boolean;
}) {
  const tone = selected
    ? "border-bone bg-bone/5 text-bone"
    : available || state.startsWith("CURRENT")
      ? "border-ink-line text-bone-dim"
      : "border-ink-line/60 text-stone";
  const shape = selected ? "border-2 px-[7px] py-1" : "border px-2 py-[5px]";

  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      aria-current={selected ? "page" : undefined}
      aria-label={`Week ${label.slice(1)}, ${state.toLowerCase()}${selected ? ", selected" : ""}`}
      className={`mono flex min-w-[58px] shrink-0 flex-col tabular-nums ${shape} ${tone}`}
    >
      <span className="text-2xs leading-none">{label}</span>
      <span className="mt-1 text-[8px] leading-none tracking-[0.06em]">{state}</span>
    </Link>
  );
}
