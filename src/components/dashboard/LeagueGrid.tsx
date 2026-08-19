"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeagueCard } from "@/components/LeagueCard";
import { useReorder } from "@/components/dashboard/useReorder";
import type { MatchupCard } from "@/lib/matchup";
import { matchupOrderKey } from "@/lib/matchup-order";

/**
 * The card list. One column on a phone, two at the wide breakpoint with the
 * first two cards spanning the full width — the closest games stay biggest.
 */
export function LeagueGrid({
  cards,
  onMove,
  onOpenConnections,
}: {
  cards: MatchupCard[];
  onMove: (activeKey: string, targetKey: string) => void;
  onOpenConnections: () => void;
}) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");

  async function retrySync() {
    await fetch("/api/live/sync", { method: "POST", cache: "no-store" });
    router.refresh();
  }
  const reorder = useReorder({
    attribute: "matchupOrderKey",
    onMove: (activeKey, targetKey) => {
      onMove(activeKey, targetKey);
      announce(activeKey, targetKey);
    },
  });

  function announce(activeKey: string, targetKey: string) {
    const position = cards.findIndex((card) => matchupOrderKey(card) === targetKey) + 1;
    const league = cards.find((card) => matchupOrderKey(card) === activeKey)?.leagueName ?? "Matchup";
    setAnnouncement(`${league} moved to position ${position}.`);
  }

  return (
    <section
      className="grid grid-cols-1 items-start gap-[13px] px-[18px] pt-4 pb-7 wide:grid-cols-2"
      aria-label="Leagues"
    >
      <span className="mono text-[10px] tracking-[0.14em] text-stone wide:col-span-2">
        CLOSEST MARGIN FIRST · DRAG TO REORDER
      </span>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {cards.map((card, index) => {
        const key = matchupOrderKey(card);
        const dragging = reorder.draggingKey === key;
        const dropTarget = reorder.draggingKey !== null && reorder.dropTargetKey === key && !dragging;

        return (
          <div
            key={key}
            data-matchup-order-key={key}
            className={`${index < 2 ? "wide:col-span-2" : ""} ${dragging ? "opacity-60" : ""} ${dropTarget ? "outline-1 outline-offset-2 outline-amber" : "outline-1 outline-transparent"}`}
          >
            <LeagueCard
              card={card}
              onOpenConnections={onOpenConnections}
              onRetrySync={retrySync}
              reorderHandle={
                <button
                  type="button"
                  className={`mono shrink-0 touch-none select-none text-[12px] text-stone hover:text-bone ${dragging ? "cursor-grabbing text-bone" : "cursor-grab"}`}
                  aria-label={`Reorder ${card.leagueName}. Position ${index + 1} of ${cards.length}. Drag, or use arrow keys.`}
                  title="Drag to reorder · arrow keys also work"
                  onKeyDown={(event) => {
                    const target =
                      event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : -1;
                    if (target < 0 || target >= cards.length) return;
                    event.preventDefault();
                    const targetKey = matchupOrderKey(cards[target]);
                    onMove(key, targetKey);
                    announce(key, targetKey);
                  }}
                  {...reorder.handleProps(key)}
                >
                  ⠿
                </button>
              }
            />
          </div>
        );
      })}
    </section>
  );
}
