"use client";

import { PlatformMark } from "@/components/PlatformMark";
import { SlateMark } from "@/components/SlateMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useClock } from "@/lib/useClock";
import { initials, type AccountIdentity } from "@/lib/account";
import type { Platform } from "@/lib/matchup";

const PLATFORMS: Platform[] = ["sleeper", "yahoo", "espn"];

/**
 * Sticky header. Everything on the right edge — the account chip, the provider
 * marks, and the sync line — opens the same account sheet, because "why is this
 * stale" and "what am I connected to" are the same question.
 */
export function AppHeader({
  week,
  identity,
  connected,
  liveCount,
  leagueCount,
  lastSyncedAt,
  accountOpen,
  onToggleAccount,
}: {
  week: number | null;
  identity: AccountIdentity;
  connected: Platform[];
  liveCount: number;
  leagueCount: number;
  lastSyncedAt: string | null;
  accountOpen: boolean;
  onToggleAccount: () => void;
}) {
  const tick = useClock();
  const now = tick === null ? null : new Date();
  const day = now ? now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase() : "";
  const time = now ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-[14px] border-b border-ink-line bg-deep px-[18px] pt-4 pb-[14px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-[7px]">
          <span className="flex items-center gap-2">
            <SlateMark />
            <span className="mono text-[10px] tracking-[0.14em] text-stone">
              {now ? `${day} · ${time}` : "SLATE"}
            </span>
          </span>
          <h1 className="display text-[30px] leading-none tracking-[-0.02em]">
            {week ? `Week ${week}` : "Preseason"}
          </h1>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              onClick={onToggleAccount}
              aria-expanded={accountOpen}
              aria-controls="account-sheet"
              className={`flex cursor-pointer items-center gap-[7px] rounded-[4px] border py-[5px] pr-[9px] pl-[6px] ${accountOpen ? "border-amber" : "border-ink-line"}`}
            >
              <span className="mono grid h-[18px] w-[18px] place-items-center rounded-full border border-ink-line bg-ink-raised text-[8.5px] text-bone-dim">
                {initials(identity)}
              </span>
              <span className={`mono text-[9.5px] tracking-[0.1em] ${accountOpen ? "text-bone" : "text-bone-dim"}`}>
                ACCOUNT
              </span>
            </button>
            <ThemeToggle />
          </div>

          {liveCount > 0 && (
            <span className="mono flex items-center gap-[6px] text-[10px] tracking-[0.1em] text-amber">
              <i className="pulse h-[5px] w-[5px] rounded-full bg-amber" aria-hidden />
              {liveCount} LIVE
            </span>
          )}

          <button
            type="button"
            onClick={onToggleAccount}
            className="flex cursor-pointer items-center gap-2"
            aria-label="Open connections and account"
          >
            <span className="flex items-center gap-[6px]">
              {PLATFORMS.map((platform) => (
                <span
                  key={platform}
                  className={connected.includes(platform) ? "opacity-100" : "opacity-30"}
                >
                  <PlatformMark platform={platform} variant="mark" size={14} />
                </span>
              ))}
            </span>
            <SyncLine iso={lastSyncedAt} leagueCount={leagueCount} tick={tick} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncLine({
  iso,
  leagueCount,
  tick,
}: {
  iso: string | null;
  leagueCount: number;
  tick: number | null;
}) {
  const leagues = leagueCount === 0
    ? "NO LEAGUES CONNECTED"
    : `${leagueCount} LEAGUE${leagueCount === 1 ? "" : "S"}`;
  // Before hydration there is no reliable clock, so the relative half waits.
  const synced = !iso ? "NEVER SYNCED" : tick === null ? "SYNCED …" : `SYNCED ${ago(new Date(iso))}`;

  return (
    <span className="mono text-[10px] tracking-[0.08em] text-stone">
      {leagueCount === 0 ? leagues : `${synced} · ${leagues}`}
    </span>
  );
}

function ago(then: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return `${seconds}S AGO`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  return `${Math.round(hours / 24)}D AGO`;
}
