"use client";

import { useState } from "react";
import { type MatchupCard, type MatchupPlayer, type Side } from "@/lib/matchup";
import type { StarterSummary } from "@/lib/game-state";
import { PlatformMark } from "@/components/PlatformMark";

/**
 * Color means game state and nothing else — see DESIGN.md. Platform identity
 * stays neutral: an official monochrome mark where available, otherwise the
 * compact monogram fallback.
 */
export function LeagueCard({ card }: { card: MatchupCard }) {
  const [expanded, setExpanded] = useState(false);
  const mine = card.mine.points ?? 0;
  const theirs = card.opponent?.points ?? 0;
  const diff = mine - theirs;

  const total = mine + theirs;
  const share = card.winProbability ?? (total > 0 ? Math.round((mine / total) * 100) : 50);

  return (
    <article className={`${expanded ? "" : "group/card"} border border-ink-line bg-ink-raised px-4 pt-[15px] pb-[13px]`}>
      <div className="mb-[15px] flex items-center gap-[10px]">
        <PlatformMark platform={card.platform} />
        <span className="display min-w-0 flex-1 truncate text-sm font-bold">
          {card.leagueName}
        </span>
        {card.leagueStatus === "pre_draft" ? (
          <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">PRE-DRAFT</span>
        ) : (
          <StateLabel isFinal={card.isFinal} isLive={card.isLive} hasScore={total > 0} />
        )}
      </div>

      {card.leagueStatus === "pre_draft" ? (
        <PreDraft card={card} />
      ) : (
        <>

          <Row side={card.mine} isMine diff={diff} isFinal={card.isFinal} />

          <div className="relative my-[14px] h-[2px] bg-ink-line">
        <i
          className={`absolute inset-y-0 left-0 block ${diff < 0 ? "bg-flag" : "bg-turf"}`}
          style={{ width: `${share}%` }}
        />
        <u className="absolute top-[-3px] left-1/2 h-2 w-px bg-bone-dim opacity-70" />
          </div>

          <Row side={card.opponent} isMine={false} diff={0} isFinal={card.isFinal} />

          <div className="mt-[14px] flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-line pt-[11px] text-2xs text-bone-dim">
            <span className="mono">
              {card.winProbability === null
                ? marginLabel(diff, card.isFinal, total)
                : `${card.winProbability}% win`}
            </span>
            <StarterAvailability
              leagueId={card.leagueId}
              week={card.week}
              mine={card.starterStatus.mine}
              opponent={card.starterStatus.opponent}
            />
            <button
              type="button"
              className="ml-auto border border-ink-line px-3 py-2 text-left text-2xs text-bone hover:bg-ink focus-visible:outline-2 focus-visible:outline-amber"
              aria-expanded={expanded}
              aria-controls={`matchup-detail-${card.leagueId}`}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "HIDE MATCHUP ↑" : "VIEW MATCHUP ↓"}
            </button>
          </div>
          {expanded ? <MatchupDetail card={card} /> : null}
        </>
      )}
    </article>
  );
}

function StarterAvailability({
  leagueId,
  week,
  mine,
  opponent,
}: {
  leagueId: string;
  week: number;
  mine: StarterSummary;
  opponent: StarterSummary | null;
}) {
  const tooltipId = `starter-status-${leagueId}`;

  return (
    <button
      type="button"
      className="group/status relative -m-2 inline-flex min-h-11 cursor-help items-center p-2"
      aria-describedby={tooltipId}
      aria-label={`Week ${week} starters: you ${mine.remaining} left, opponent ${opponent?.remaining ?? "unknown"} left`}
    >
      <span className="mono whitespace-nowrap border-b border-dotted border-ink-line pb-[2px] text-bone-dim">
        YOU {mine.remaining} LEFT · OPP {opponent?.remaining ?? "—"} LEFT
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 bottom-[calc(100%+4px)] z-20 w-[220px] max-w-[calc(100vw-72px)] border border-ink-line bg-ink px-3 py-3 opacity-0 shadow-lg transition-opacity group-hover/card:visible group-hover/card:opacity-100 group-hover/status:visible group-hover/status:opacity-100 group-focus/status:visible group-focus/status:opacity-100"
      >
        <span className="mono mb-2 block text-[9px] tracking-[0.1em] text-bone">
          WEEK {week} STARTERS
        </span>
        <span className="mono grid grid-cols-[1fr_34px_34px] gap-2 pb-1 text-[8px] tracking-[0.08em] text-stone">
          <span>STATE</span>
          <span className="text-right">YOU</span>
          <span className="text-right">OPP</span>
        </span>
        <StatusRow label="PLAYED" mine={mine.played} opponent={opponent?.played} />
        <StatusRow label="LIVE" mine={mine.live} opponent={opponent?.live} live />
        <StatusRow label="TO PLAY" mine={mine.upcoming} opponent={opponent?.upcoming} />
        {(mine.unassigned > 0 || (opponent?.unassigned ?? 0) > 0) ? (
          <StatusRow
            label="UNMATCHED"
            mine={mine.unassigned}
            opponent={opponent?.unassigned}
          />
        ) : null}
      </span>
    </button>
  );
}

function MatchupDetail({ card }: { card: MatchupCard }) {
  return (
    <section
      id={`matchup-detail-${card.leagueId}`}
      className="mt-4 border-t border-ink-line pt-4"
      aria-label={`${card.leagueName} Week ${card.week} matchup details`}
    >
      <div className="mb-4 flex items-center gap-2">
        <PlatformMark platform={card.platform} />
        <div className="min-w-0">
          <p className="mono text-[9px] tracking-[0.1em] text-stone">WEEK {card.week} MATCHUP</p>
          <p className="truncate text-xs text-bone">{card.mine.name} vs {card.opponent?.name ?? "No opponent"}</p>
        </div>
      </div>

      <WeeklySummary mine={card.starterStatus.mine} opponent={card.starterStatus.opponent} />
      <HeadToHeadLineups mine={card.mine} opponent={card.opponent} />
      <p className="mono mt-4 text-[9px] leading-relaxed text-stone">
        SCORES AND LINEUPS SYNC FROM {card.platform.toUpperCase()} · LAST PROVIDER SYNC {syncLabel(card.syncedAt)}
      </p>
    </section>
  );
}

function WeeklySummary({ mine, opponent }: { mine: StarterSummary; opponent: StarterSummary | null }) {
  return (
    <div className="mb-5 border border-ink-line bg-ink px-3 py-3">
      <p className="mono mb-2 text-[9px] tracking-[0.1em] text-bone">WEEKLY STARTERS</p>
      <div className="mono grid grid-cols-[1fr_42px_42px] gap-2 text-[9px]">
        <span className="text-stone">STATE</span><span className="text-right text-stone">YOU</span><span className="text-right text-stone">OPP</span>
        <SummaryCell label="PLAYED" mine={mine.played} opponent={opponent?.played} />
        <SummaryCell label="LIVE" mine={mine.live} opponent={opponent?.live} live />
        <SummaryCell label="TO PLAY" mine={mine.upcoming} opponent={opponent?.upcoming} />
      </div>
    </div>
  );
}

function SummaryCell({ label, mine, opponent, live = false }: { label: string; mine: number; opponent?: number; live?: boolean }) {
  return (
    <>
      <span className={`border-t border-ink-line pt-1 ${live ? "text-amber" : "text-bone-dim"}`}>{label}</span>
      <span className="border-t border-ink-line pt-1 text-right text-bone">{mine}</span>
      <span className="border-t border-ink-line pt-1 text-right text-bone">{opponent ?? "—"}</span>
    </>
  );
}

function HeadToHeadLineups({ mine, opponent }: { mine: Side; opponent: Side | null }) {
  const mineStarters = mine.lineup?.starters ?? [];
  const opponentStarters = opponent?.lineup?.starters ?? [];
  const mineBench = mine.lineup?.bench ?? [];
  const opponentBench = opponent?.lineup?.bench ?? [];

  return (
    <section className="mt-5" aria-label="Head-to-head lineups">
      <div className="grid grid-cols-2 gap-2 border-b border-ink-line pb-2">
        <TeamColumnHeader label="YOU" side={mine} />
        <TeamColumnHeader label="OPP" side={opponent} />
      </div>
      <PairedPlayerGroup label="STARTERS" mine={mineStarters} opponent={opponentStarters} />
      <details className="group/bench mt-3 border-t border-ink-line">
        <summary className="mono flex min-h-11 cursor-pointer list-none items-center justify-between text-[9px] tracking-[0.1em] text-stone focus-visible:outline-2 focus-visible:outline-amber">
          <span>BENCH · YOU {mineBench.length} / OPP {opponentBench.length}</span>
          <span aria-hidden className="group-open/bench:hidden">SHOW ↓</span>
          <span aria-hidden className="hidden group-open/bench:inline">HIDE ↑</span>
        </summary>
        <PairedPlayerRows mine={mineBench} opponent={opponentBench} emptyLabel="No bench synced." />
      </details>
    </section>
  );
}

function TeamColumnHeader({ label, side }: { label: string; side: Side | null }) {
  return (
    <div className="min-w-0">
      <p className="mono text-[9px] tracking-[0.1em] text-stone">{label}</p>
      <p className="display truncate text-xs text-bone">{side?.name ?? "No opponent"}</p>
    </div>
  );
}

function PairedPlayerGroup({ label, mine, opponent }: { label: string; mine: MatchupPlayer[]; opponent: MatchupPlayer[] }) {
  return (
    <div className="mt-3">
      <p className="mono mb-1 text-[9px] tracking-[0.1em] text-stone">{label} · YOU {mine.length} / OPP {opponent.length}</p>
      <PairedPlayerRows mine={mine} opponent={opponent} emptyLabel={`No ${label.toLowerCase()} synced.`} />
    </div>
  );
}

function PairedPlayerRows({ mine, opponent, emptyLabel }: { mine: MatchupPlayer[]; opponent: MatchupPlayer[]; emptyLabel: string }) {
  const length = Math.max(mine.length, opponent.length);
  if (length === 0) return <p className="border-t border-ink-line py-2 text-xs text-bone-dim">{emptyLabel}</p>;

  return Array.from({ length }, (_, index) => (
    <div className="grid grid-cols-2 border-t border-ink-line py-2" key={`${mine[index]?.externalPlayerId ?? "empty"}:${opponent[index]?.externalPlayerId ?? "empty"}`}>
      <PlayerCell player={mine[index]} side="left" />
      <PlayerCell player={opponent[index]} side="right" />
    </div>
  ));
}

function PlayerCell({ player, side }: { player: MatchupPlayer | undefined; side: "left" | "right" }) {
  if (!player) return <div className={`min-h-12 min-w-0 text-xs text-stone ${side === "left" ? "text-left" : "text-right"}`}>—</div>;
  const game = playerGameLabel(player);
  const score = (
    <div className={`mono self-center tabular-nums ${side === "left" ? "text-right" : "text-left"}`}>
      <p className="text-[15px] font-medium leading-none text-bone">{numberLabel(player.currentPoints)}</p>
      <p className="mt-1 text-[10px] leading-none text-stone">{numberLabel(player.projectedPoints)}</p>
    </div>
  );
  const identity = (
    <div className={`min-w-0 self-center ${side === "left" ? "text-left" : "text-right"}`}>
      <div className={`flex min-w-0 items-baseline gap-1 ${side === "left" ? "justify-start" : "justify-end"}`}>
        {side === "left" ? <span className="mono shrink-0 text-[8px] text-stone">{slotLabel(player.slot)}</span> : null}
        <p className="truncate text-xs text-bone">{player.name}</p>
        {side === "right" ? <span className="mono shrink-0 text-[8px] text-stone">{slotLabel(player.slot)}</span> : null}
      </div>
      <p className={`mono mt-0.5 truncate text-[8px] ${player.game?.inProgress ? "text-amber" : "text-stone"}`}>
        {[player.nflTeam, game, lockLabel(player), meaningfulStatus(player.injuryStatus)].filter(Boolean).join(" · ")}
      </p>
    </div>
  );

  return (
    <div className={`grid min-h-12 min-w-0 items-stretch gap-2 ${side === "left" ? "grid-cols-[minmax(0,1fr)_42px] pr-2" : "grid-cols-[42px_minmax(0,1fr)] border-l border-ink-line pl-2"}`}>
      {side === "left" ? identity : score}
      {side === "left" ? score : identity}
    </div>
  );
}

function playerGameLabel(player: MatchupPlayer): string {
  const game = player.game;
  if (!game) return "BYE / TBD";
  if (game.canceled) return "CANCELED";
  if (game.isOver) return "FINAL";
  if (game.inProgress) return game.quarter ? `LIVE ${game.quarter}` : "LIVE";
  if (!game.startTime) return game.opponent ? `vs ${game.opponent}` : "TBD";
  const date = new Date(game.startTime);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/New_York" }).format(date).toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date);
  return `${game.opponent ? `vs ${game.opponent} · ` : ""}${day} ${time}`;
}

function meaningfulStatus(status: string | null): string | null {
  if (!status || status.toLowerCase() === "active") return null;
  return status.toUpperCase();
}

function lockLabel(player: MatchupPlayer): string | null {
  return player.game?.inProgress || player.game?.isOver ? "LOCKED" : null;
}

function slotLabel(slot: string | null): string {
  return slot?.replace("SUPER_FLEX", "SFLX") ?? "—";
}

function numberLabel(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function syncLabel(iso: string | null): string {
  if (!iso) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(iso)).toUpperCase();
}

function StatusRow({
  label,
  mine,
  opponent,
  live = false,
}: {
  label: string;
  mine: number;
  opponent: number | undefined;
  live?: boolean;
}) {
  return (
    <span className="mono grid grid-cols-[1fr_34px_34px] gap-2 border-t border-ink-line py-1 text-[9px] first:border-t-0">
      <span className={live ? "text-amber" : "text-bone-dim"}>{label}</span>
      <span className="text-right text-bone" aria-label={`You ${mine}`}>{mine}</span>
      <span className="text-right text-bone" aria-label={`Opponent ${opponent ?? "unknown"}`}>
        {opponent ?? "—"}
      </span>
    </span>
  );
}

function PreDraft({ card }: { card: MatchupCard }) {
  return (
    <div>
      <p className="text-sm font-semibold text-bone">Draft not started</p>
      <p className="mt-1 text-xs text-bone-dim">
        {card.teamCount ? `${card.teamCount} teams · ` : ""}Matchups and projections will appear after the draft.
      </p>
      <div className="mt-[14px] border-t border-ink-line pt-[11px] text-2xs text-bone-dim">
        <span className="mono">{card.mine.teamId ? card.mine.name : "ROSTER PENDING"}</span>
      </div>
    </div>
  );
}

function StateLabel({ isFinal, isLive, hasScore }: { isFinal: boolean; isLive: boolean; hasScore: boolean }) {
  if (isFinal) {
    return <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">FINAL</span>;
  }
  if (!hasScore) {
    // Pre-kickoff. Amber is rationed for things actually happening.
    return <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">PREGAME</span>;
  }
  if (!isLive) {
    return <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">IN PROGRESS</span>;
  }
  return (
    <span className="mono flex items-center gap-[6px] text-[10px] tracking-[0.14em] text-amber">
      <i className="pulse block h-2 w-2 rounded-full bg-amber" aria-hidden />
      LIVE
    </span>
  );
}

function Row({
  side,
  isMine,
  diff,
  isFinal,
}: {
  side: Side | null;
  isMine: boolean;
  diff: number;
  isFinal: boolean;
}) {
  if (!side) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-bone-dim">No opponent this week</div>
        <div className="display text-right text-[27px] leading-none text-bone-dim">—</div>
      </div>
    );
  }

  // Only my own score is colored. Coloring both sides would double the
  // ink for one piece of information.
  const tone = !isMine || diff === 0 ? "text-bone" : diff > 0 ? "text-turf" : "text-flag";

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className={`truncate text-sm ${isMine ? "font-semibold text-bone" : "text-bone-dim"}`}>
          {side.name}
        </div>
        <div className="mono mt-[3px] text-2xs text-bone-dim">
          {isFinal ? "final" : `proj ${side.projected?.toFixed(1) ?? "—"}`}
        </div>
      </div>
      <div className={`display text-right text-[27px] leading-none ${tone}`}>
        {side.points?.toFixed(1) ?? "—"}
      </div>
    </div>
  );
}

function marginLabel(diff: number, isFinal: boolean, total: number): string {
  if (total === 0) return "not started";
  const amount = Math.abs(diff).toFixed(1);
  if (diff === 0) return isFinal ? "tied" : "level";
  if (isFinal) return diff > 0 ? `won by ${amount}` : `lost by ${amount}`;
  return diff > 0 ? `up ${amount}` : `down ${amount}`;
}
