"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AccountSheet, type LeagueRow } from "@/components/dashboard/AccountSheet";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { AroundTheLeague } from "@/components/dashboard/AroundTheLeague";
import { LeagueGrid } from "@/components/dashboard/LeagueGrid";
import { ScoreTicker } from "@/components/dashboard/ScoreTicker";
import { WeekSelect } from "@/components/dashboard/WeekSelect";
import { LiveRefresh } from "@/components/LiveRefresh";
import { SlateMark } from "@/components/SlateMark";
import type { AccountIdentity } from "@/lib/account";
import type { PlatformConnectionStatuses } from "@/lib/connector-status";
import type { MatchupCard, Platform } from "@/lib/matchup";
import {
  MATCHUP_ORDER_STORAGE_KEY,
  matchupOrderKey,
  moveMatchupCard,
  orderMatchupCards,
  parseStoredMatchupOrder,
  updatePreferredKeys,
} from "@/lib/matchup-order";
import type { NflGameBox } from "@/lib/nfl-scoreboard";
import {
  HIDDEN_LEAGUES_STORAGE_KEY,
  NOTIFICATION_STORAGE_KEY,
  parseHiddenLeagues,
  parseNotifications,
  serialize,
  toggle,
  type NotificationKey,
} from "@/lib/preferences";
import { buildTickerItems } from "@/lib/ticker";
import { useConnections } from "@/lib/useConnections";
import type { WeekOption } from "@/lib/weeks";

const TOAST_MS = 3_600;

export function DashboardShell({
  cards,
  games,
  week,
  weeks,
  leagueCount,
  lastSyncedAt,
  statuses,
  identity,
  notice,
  weekState,
  emptyMessage,
}: {
  cards: MatchupCard[];
  games: NflGameBox[];
  week: number | null;
  weeks: WeekOption[];
  leagueCount: number;
  lastSyncedAt: string | null;
  statuses: PlatformConnectionStatuses;
  identity: AccountIdentity;
  notice?: string;
  weekState: string;
  emptyMessage: string | null;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  const [sessionOrder, setSessionOrder] = useState<string[] | null>(null);
  const storedOrder = useStored(MATCHUP_ORDER_STORAGE_KEY);
  const preferredKeys = useMemo(
    () => sessionOrder ?? parseStoredMatchupOrder(storedOrder),
    [sessionOrder, storedOrder]
  );

  const [hidden, setHidden] = useState<string[] | null>(null);
  const storedHidden = useStored(HIDDEN_LEAGUES_STORAGE_KEY);
  const hiddenKeys = hidden ?? parseHiddenLeagues(storedHidden);

  const [notifications, setNotifications] = useState<NotificationKey[] | null>(null);
  const storedNotifications = useStored(NOTIFICATION_STORAGE_KEY);
  const notificationKeys = notifications ?? parseNotifications(storedNotifications);

  const ordered = useMemo(() => orderMatchupCards(cards, preferredKeys), [cards, preferredKeys]);
  const visible = useMemo(
    () => ordered.filter((card) => !hiddenKeys.includes(matchupOrderKey(card))),
    [ordered, hiddenKeys]
  );

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const connections = useConnections(statuses, showToast);

  function move(activeKey: string, targetKey: string) {
    const next = moveMatchupCard(ordered, activeKey, targetKey);
    if (next === ordered) return;
    const keys = updatePreferredKeys(preferredKeys, next.map(matchupOrderKey));
    setSessionOrder(keys);
    write(MATCHUP_ORDER_STORAGE_KEY, JSON.stringify({ version: 1, keys }));
  }

  function toggleHidden(key: string) {
    const next = toggle(hiddenKeys, key);
    setHidden(next);
    write(HIDDEN_LEAGUES_STORAGE_KEY, serialize(next));
  }

  function toggleNotification(key: NotificationKey) {
    const next = toggle(notificationKeys, key);
    setNotifications(next);
    write(NOTIFICATION_STORAGE_KEY, serialize(next));
  }

  const connected = connectedPlatforms(connections.statuses);
  const leagueRows: LeagueRow[] = ordered.map((card) => ({
    key: matchupOrderKey(card),
    name: card.leagueName,
    meta: `${card.platform.toUpperCase()} · ${card.leagueFormat === "chopped" ? "CHOPPED" : card.leagueType.toUpperCase()}`,
    hidden: hiddenKeys.includes(matchupOrderKey(card)),
  }));

  return (
    <div className="flex min-h-dvh w-full max-w-app flex-col border-ink-line wide:max-w-wide wide:border-x">
      <AppHeader
        week={week}
        identity={identity}
        connected={connected}
        liveCount={visible.filter((card) => card.isLive).length}
        leagueCount={leagueCount}
        lastSyncedAt={lastSyncedAt}
        accountOpen={accountOpen}
        onToggleAccount={() => setAccountOpen((value) => !value)}
        onConnectPlatform={(platform) => {
          // Open the sheet either way: it is where the result shows up.
          setAccountOpen(true);
          connections.connect(platform);
        }}
      />

      <WeekSelect weeks={weeks} selected={week} liveState={weekState} />

      <ScoreTicker items={buildTickerItems(visible)} />

      <AroundTheLeague games={games} week={week} />

      {accountOpen && (
        <AccountSheet
          identity={identity}
          notice={notice}
          leagueCounts={leagueCounts(cards)}
          leagues={leagueRows}
          notifications={notificationKeys}
          onToggleNotification={toggleNotification}
          onToggleHidden={toggleHidden}
          onMoveLeague={move}
          onToast={showToast}
          onClose={() => setAccountOpen(false)}
          connections={connections}
        />
      )}

      {visible.length > 0 ? (
        <LeagueGrid cards={visible} onMove={move} onOpenConnections={() => setAccountOpen(true)} />
      ) : (
        <EmptyState
          message={
            emptyMessage ??
            (hiddenKeys.length > 0
              ? "Every league is hidden. Open Connections to show one again."
              : "Nothing to score for this week yet.")
          }
          onOpenConnections={() => setAccountOpen(true)}
        />
      )}

      <div className="sr-only">
        <LiveRefresh enabled={leagueCount > 0} />
      </div>

      {toast && (
        <div
          className="sticky bottom-0 z-20 mt-auto flex items-center gap-[9px] border-t border-ink-line bg-ink-raised px-[18px] py-[11px]"
          role="status"
        >
          <span className="h-[5px] w-[5px] rounded-full bg-turf" aria-hidden />
          <span className="text-[calc(12.5px*var(--ui-scale))] text-bone">{toast}</span>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  message,
  onOpenConnections,
}: {
  message: string;
  onOpenConnections: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 px-[18px] py-[60px] text-center">
      <SlateMark size={44} lit={false} />
      <h2 className="display text-[calc(18px*var(--ui-scale))]">No leagues yet</h2>
      <p className="max-w-[300px] text-[calc(13.5px*var(--ui-scale))] leading-relaxed text-bone-dim">{message}</p>
      <button
        type="button"
        onClick={onOpenConnections}
        className="mono mt-1 cursor-pointer rounded-[4px] border border-ink-line bg-ink-raised px-[18px] py-3 text-[calc(11px*var(--ui-scale))] tracking-[0.1em] text-bone"
      >
        OPEN CONNECTIONS
      </button>
    </section>
  );
}

function connectedPlatforms(statuses: PlatformConnectionStatuses): Platform[] {
  const connected: Platform[] = [];
  if (statuses.sleeper.state === "connected") connected.push("sleeper");
  if (statuses.yahoo.connected) connected.push("yahoo");
  if (statuses.espn.state === "connected") connected.push("espn");
  return connected;
}

function leagueCounts(cards: MatchupCard[]): Record<Platform, number> {
  const counts: Record<Platform, number> = { sleeper: 0, yahoo: 0, espn: 0 };
  for (const card of cards) counts[card.platform] += 1;
  return counts;
}

/** Storage is shared across tabs, so the value is read through a subscription. */
function useStored(key: string): string | null {
  return useSyncExternalStore(
    (callback) => {
      function onStorage(event: StorageEvent) {
        if (event.key === key) callback();
      }
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null
  );
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode. The change still applies to this page.
  }
}
