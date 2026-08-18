"use client";

import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LeagueCard } from "@/components/LeagueCard";
import type { MatchupCard } from "@/lib/matchup";
import {
  MATCHUP_ORDER_STORAGE_KEY,
  matchupOrderKey,
  moveMatchupCard,
  orderMatchupCards,
  parseStoredMatchupOrder,
  updatePreferredKeys,
} from "@/lib/matchup-order";

export function SortableLeagueCards({ cards }: { cards: MatchupCard[] }) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const dropTargetKeyRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [sessionKeys, setSessionKeys] = useState<string[] | null>(null);
  const storedValue = useSyncExternalStore(
    subscribeToStoredOrder,
    readStoredOrder,
    () => null
  );
  const storedKeys = useMemo(
    () => parseStoredMatchupOrder(storedValue),
    [storedValue]
  );
  const preferredKeys = sessionKeys ?? storedKeys;
  const orderedCards = useMemo(
    () => orderMatchupCards(cards, preferredKeys),
    [cards, preferredKeys]
  );

  function persist(next: MatchupCard[]) {
    const visibleKeys = next.map(matchupOrderKey);
    const keys = updatePreferredKeys(preferredKeys, visibleKeys);
    setSessionKeys(keys);
    try {
      window.localStorage.setItem(
        MATCHUP_ORDER_STORAGE_KEY,
        JSON.stringify({ version: 1, keys })
      );
    } catch {
      // Reordering still works for this page when browser storage is unavailable.
    }
  }

  function move(activeKey: string, targetKey: string, announce = false) {
    const next = moveMatchupCard(orderedCards, activeKey, targetKey);
    if (next === orderedCards) return;
    persist(next);
    if (announce) {
      const position = next.findIndex((card) => matchupOrderKey(card) === activeKey) + 1;
      const league = next[position - 1]?.leagueName ?? "Matchup";
      setAnnouncement(`${league} moved to position ${position}.`);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingKeyRef.current) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-matchup-order-key]")
      ?.dataset.matchupOrderKey;
    if (!target || target === dropTargetKeyRef.current) return;
    dropTargetKeyRef.current = target;
    setDropTargetKey(target);
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeKey = draggingKeyRef.current;
    const targetKey = dropTargetKeyRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (activeKey && targetKey && activeKey !== targetKey) move(activeKey, targetKey, true);
    draggingKeyRef.current = null;
    dropTargetKeyRef.current = null;
    setDraggingKey(null);
    setDropTargetKey(null);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingKeyRef.current = null;
    dropTargetKeyRef.current = null;
    setDraggingKey(null);
    setDropTargetKey(null);
  }

  return (
    <section className="mt-[22px] flex flex-col gap-3" aria-label="Ordered leagues">
      <p className="mono px-1 text-[9px] tracking-[0.1em] text-stone">
        DRAG, PLACE, AND RELEASE ONCE · SAVED IN THIS BROWSER
      </p>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {orderedCards.map((card, index) => {
        const key = matchupOrderKey(card);
        const dragging = draggingKey === key;
        const dropTarget = draggingKey !== null && dropTargetKey === key && !dragging;
        return (
          <div
            key={key}
            data-matchup-order-key={key}
            className={`transition-[opacity,outline-color] ${dragging ? "opacity-60" : "opacity-100"} ${dropTarget ? "outline-1 outline-offset-2 outline-amber" : "outline-1 outline-transparent"}`}
          >
            <LeagueCard
              card={card}
              reorderHandle={(
                <button
                  type="button"
                  className={`-ml-1 inline-flex min-h-11 min-w-11 touch-none select-none items-center justify-center text-bone-dim hover:text-bone focus-visible:outline-2 focus-visible:outline-amber ${dragging ? "cursor-grabbing text-bone" : "cursor-grab"}`}
                  aria-label={`Reorder ${card.leagueName}. Position ${index + 1} of ${orderedCards.length}. Use up and down arrow keys or drag.`}
                  title="Drag to reorder · arrow keys also work"
                  onPointerDown={(event) => {
                    if (!event.isPrimary) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    draggingKeyRef.current = key;
                    dropTargetKeyRef.current = key;
                    setDraggingKey(key);
                    setDropTargetKey(key);
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => {
                    const targetIndex = event.key === "ArrowUp"
                      ? index - 1
                      : event.key === "ArrowDown"
                        ? index + 1
                        : -1;
                    if (targetIndex < 0 || targetIndex >= orderedCards.length) return;
                    event.preventDefault();
                    move(key, matchupOrderKey(orderedCards[targetIndex]), true);
                  }}
                >
                  <span aria-hidden className="flex w-5 flex-col gap-1">
                    <i className="h-px w-full bg-current" />
                    <i className="h-px w-full bg-current" />
                    <i className="h-px w-full bg-current" />
                  </span>
                </button>
              )}
            />
          </div>
        );
      })}
    </section>
  );
}

function subscribeToStoredOrder(callback: () => void): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key === MATCHUP_ORDER_STORAGE_KEY) callback();
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function readStoredOrder(): string | null {
  try {
    return window.localStorage.getItem(MATCHUP_ORDER_STORAGE_KEY);
  } catch {
    return null;
  }
}
