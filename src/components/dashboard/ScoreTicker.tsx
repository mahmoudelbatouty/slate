"use client";

import type { TickerItem } from "@/lib/ticker";

/**
 * The score strip. The item list is rendered twice inside one `max-content`
 * row and translated -50%, so the loop has no seam. Hovering pauses it, and a
 * tap jumps to that league's card — the strip is navigation, not decoration.
 */
export function ScoreTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="ticker-strip overflow-hidden border-b border-ink-line bg-deep py-[9px]">
      <div className="ticker-run flex">
        {[0, 1].map((run) => (
          <div className="flex items-center" key={run} aria-hidden={run === 1}>
            {items.map((item) => (
              <TickerButton key={`${run}:${item.key}`} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TickerButton({ item }: { item: TickerItem }) {
  return (
    <button
      type="button"
      title={`Jump to ${item.home}`}
      onClick={() => jumpTo(item.target)}
      className="mono flex cursor-pointer items-center gap-[9px] border-r border-ink-line px-4 text-[11px] tracking-[0.04em] whitespace-nowrap text-bone-dim"
    >
      <span className={item.isMine ? "text-amber" : "text-bone-dim"}>{item.home}</span>
      <span className="tabular-nums text-bone">{item.score}</span>
      <span className="text-stone">{item.away}</span>
    </button>
  );
}

/** Offset clears the sticky header, which would otherwise cover the card. */
function jumpTo(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  window.scrollTo({
    top: element.getBoundingClientRect().top + window.scrollY - 90,
    behavior: "smooth",
  });
}
