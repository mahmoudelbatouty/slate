"use client";

import { useState, type ReactNode } from "react";
import {
  type LeagueScoreboardGame,
  type MatchupCard,
  type MatchupPlayer,
  type Side,
} from "@/lib/matchup";
import type { StarterSummary } from "@/lib/game-state";
import { playerGameLabel } from "@/lib/player-state";
import { cardAnchorId } from "@/lib/ticker";
import { PlatformMark } from "@/components/PlatformMark";

/**
 * One league, one card. The 4px left bar is the only place the card's state is
 * encoded as pure color — amber live, stone settled, flag broken, inert for a
 * bye — and platform identity stays out of it entirely.
 */
export function LeagueCard({
  card,
  reorderHandle,
  onOpenConnections,
  onRetrySync,
}: {
  card: MatchupCard;
  reorderHandle?: ReactNode;
  onOpenConnections?: () => void;
  /** Supplied by the grid so a retry can refresh in place instead of reloading. */
  onRetrySync?: () => Promise<void>;
}) {
  const failed = Boolean(card.syncFailure);
  const preDraft = card.leagueStatus === "pre_draft";
  const bye = !preDraft && card.leagueFormat === "head_to_head" && !card.opponent;

  return (
    <article
      id={cardAnchorId(card)}
      className={`flex overflow-hidden rounded-[6px] ${preDraft ? "border border-dashed border-ink-line" : failed ? "border border-flag bg-ink-raised" : "border border-ink-line bg-ink-raised"} ${bye ? "opacity-85" : ""}`}
    >
      {!preDraft && <span className={`w-1 shrink-0 ${accent(card, failed, bye)}`} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col gap-[13px] p-[15px]">
        <CardHeader card={card} reorderHandle={reorderHandle} failed={failed} bye={bye} preDraft={preDraft} />

        {preDraft ? (
          <PreDraftBody card={card} />
        ) : failed ? (
          <FailedBody card={card} onOpenConnections={onOpenConnections} onRetrySync={onRetrySync} />
        ) : card.leagueFormat === "chopped" ? (
          <ChoppedBody card={card} />
        ) : bye ? (
          <ByeBody card={card} />
        ) : (
          <HeadToHeadBody card={card} />
        )}

        {card.platform === "yahoo" && (
          <a
            className="mono text-right text-[calc(9px*var(--ui-scale))] tracking-[0.08em] text-stone underline-offset-2 hover:text-bone hover:underline"
            href="https://football.fantasysports.yahoo.com/"
            target="_blank"
            rel="noreferrer"
          >
            Fantasy data provided by Yahoo Fantasy
          </a>
        )}
      </div>
    </article>
  );
}

function accent(card: MatchupCard, failed: boolean, bye: boolean): string {
  if (failed) return "bg-flag";
  if (bye) return "bg-mark-off";
  if (card.isLive) return "bg-amber";
  return "bg-stone";
}

function CardHeader({
  card,
  reorderHandle,
  failed,
  bye,
  preDraft,
}: {
  card: MatchupCard;
  reorderHandle?: ReactNode;
  failed: boolean;
  bye: boolean;
  preDraft: boolean;
}) {
  const muted = bye || preDraft || failed;
  return (
    <div className="flex items-center justify-between gap-[10px]">
      <div className="flex min-w-0 items-center gap-[10px]">
        {reorderHandle}
        <PlatformMark platform={card.platform} size={16} dim={muted} />
        <div className="min-w-0">
          <div className={`display truncate text-sm leading-tight ${muted ? "text-bone-dim" : "text-bone"}`}>
            {card.leagueName}
          </div>
          <div className="mono mt-[3px] truncate text-[calc(9.5px*var(--ui-scale))] tracking-[0.1em] text-stone">
            {[
              card.leagueFormat === "chopped" ? "CHOPPED" : null,
              card.leagueType.toUpperCase(),
              card.teamCount ? `${card.teamCount} TEAMS` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
      <StateLabel card={card} failed={failed} bye={bye} preDraft={preDraft} />
    </div>
  );
}

function StateLabel({
  card,
  failed,
  bye,
  preDraft,
}: {
  card: MatchupCard;
  failed: boolean;
  bye: boolean;
  preDraft: boolean;
}) {
  if (failed) {
    return <span className="mono shrink-0 text-[calc(10px*var(--ui-scale))] tracking-[0.1em] text-flag">SYNC FAILED</span>;
  }
  if (preDraft) {
    return <span className="mono shrink-0 text-[calc(10px*var(--ui-scale))] tracking-[0.1em] text-stone">PRE-DRAFT</span>;
  }
  if (bye) return <span className="mono shrink-0 text-[calc(10px*var(--ui-scale))] tracking-[0.1em] text-stone">BYE</span>;
  if (card.isFinal) {
    return <span className="mono shrink-0 text-[calc(10px*var(--ui-scale))] tracking-[0.1em] text-stone">FINAL</span>;
  }
  if (card.isLive) {
    return (
      <span className="mono flex shrink-0 items-center gap-[6px] text-[calc(10px*var(--ui-scale))] tracking-[0.1em] text-amber">
        <i className="pulse h-[5px] w-[5px] rounded-full bg-amber" aria-hidden />
        LIVE
      </span>
    );
  }
  const started = (card.mine.points ?? 0) + (card.opponent?.points ?? 0) > 0;
  return (
    <span className="mono shrink-0 text-[calc(10px*var(--ui-scale))] tracking-[0.1em] text-stone">
      {started ? "IN PROGRESS" : "PREGAME"}
    </span>
  );
}

/* ---------------------------------------------------------------- head to head */

function HeadToHeadBody({ card }: { card: MatchupCard }) {
  const [matchupOpen, setMatchupOpen] = useState(false);
  const [leagueOpen, setLeagueOpen] = useState(false);
  const diff = (card.mine.points ?? 0) - (card.opponent?.points ?? 0);

  if (card.isFinal) {
    return (
      <>
        <FinalScores card={card} diff={diff} />
        <div className="flex flex-col gap-[11px] border-t border-ink-line pt-[10px]">
          <span className="mono text-[calc(10.5px*var(--ui-scale))] text-stone">{marginLabel(diff, true)}</span>
          <div className="grid grid-cols-2 gap-2">
            <CardButton open={matchupOpen} onClick={() => setMatchupOpen((v) => !v)} label="MATCHUP" />
            <CardButton open={leagueOpen} onClick={() => setLeagueOpen((v) => !v)} label="LEAGUE" />
          </div>
        </div>
        {matchupOpen && <FinalBoxScore card={card} />}
        {leagueOpen && <LeagueExpansion card={card} />}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-[10px]">
        <ScoreRow side={card.mine} isMine isFinal={false} />
        <ScoreRow side={card.opponent} isMine={false} isFinal={false} />
      </div>

      <WinProbabilityBar probability={card.winProbability} fallback={marginLabel(diff, false)} />

      <div className="flex flex-col gap-[11px] border-t border-ink-line pt-3">
        <span className="mono text-[calc(10.5px*var(--ui-scale))] tracking-[0.06em] text-bone-dim">
          YOU {card.starterStatus.mine.remaining} LEFT · OPP {card.starterStatus.opponent?.remaining ?? "—"} LEFT
        </span>
        <div className="grid grid-cols-2 gap-2">
          <CardButton open={matchupOpen} onClick={() => setMatchupOpen((v) => !v)} label="MATCHUP" />
          <CardButton open={leagueOpen} onClick={() => setLeagueOpen((v) => !v)} label="LEAGUE" />
        </div>
      </div>

      {matchupOpen && <MatchupExpansion card={card} />}
      {leagueOpen && <LeagueExpansion card={card} />}
    </>
  );
}

function CardButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="mono min-h-11 cursor-pointer rounded-[4px] border border-ink-line px-[10px] py-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.09em] text-bone hover:bg-ink"
    >
      {open ? `HIDE ${label} ↑` : `VIEW ${label} ↓`}
    </button>
  );
}

function ScoreRow({ side, isMine, isFinal }: { side: Side | null; isMine: boolean; isFinal: boolean }) {
  if (!side) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[calc(14.5px*var(--ui-scale))] text-bone-dim">No opponent this week</span>
        <span className="display text-[calc(30px*var(--ui-scale))] leading-none text-bone-dim">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className={`truncate text-[calc(14.5px*var(--ui-scale))] ${isMine ? "font-semibold text-bone" : "text-bone-dim"}`}>
          {side.name}
        </div>
        <div className={`mono mt-[2px] text-[calc(10.5px*var(--ui-scale))] ${isMine ? "text-bone-dim" : "text-stone"}`}>
          {isFinal ? "final" : `proj ${side.projected?.toFixed(1) ?? "—"}`}
        </div>
      </div>
      <span
        className={`display shrink-0 text-[calc(30px*var(--ui-scale))] leading-none tabular-nums ${isMine ? "text-bone" : "text-bone-dim"}`}
      >
        {side.points?.toFixed(1) ?? "—"}
      </span>
    </div>
  );
}

function FinalScores({ card, diff }: { card: MatchupCard; diff: number }) {
  const rows: { side: Side | null; isMine: boolean }[] = [
    { side: card.opponent, isMine: false },
    { side: card.mine, isMine: true },
  ];
  return (
    <div className="flex flex-col gap-[9px]">
      {rows.map(({ side, isMine }) => {
        const won = isMine ? diff > 0 : diff < 0;
        return (
          <div className="flex items-baseline justify-between gap-3" key={isMine ? "mine" : "opp"}>
            <span
              className={`min-w-0 truncate text-[calc(14px*var(--ui-scale))] ${isMine ? "font-semibold text-bone" : "text-bone-dim"}`}
            >
              {side?.name ?? "No opponent"}
            </span>
            <span
              className={`display shrink-0 text-[calc(22px*var(--ui-scale))] leading-none tabular-nums ${won ? "text-turf" : isMine ? "text-bone" : "text-bone-dim"}`}
            >
              {side?.points?.toFixed(1) ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WinProbabilityBar({ probability, fallback }: { probability: number | null; fallback: string }) {
  if (probability === null) {
    return (
      <div className="mono flex flex-col gap-[6px]" aria-label={`Win odds unavailable, ${fallback}`}>
        <span className="h-[3px] rounded-[2px] bg-ink-line" aria-hidden />
        <div className="flex justify-between text-[calc(10px*var(--ui-scale))] tracking-[0.06em] text-stone">
          <span>WIN ODDS UNAVAILABLE</span>
          <span>{fallback.toUpperCase()}</span>
        </div>
      </div>
    );
  }

  const mine = Math.max(0, Math.min(100, Math.round(probability)));
  const opponent = 100 - mine;

  return (
    <div className="flex flex-col gap-[6px]" aria-label={`Win probability: you ${mine}%, opponent ${opponent}%`}>
      <div className="flex h-[3px] overflow-hidden rounded-[2px]" aria-hidden>
        <i className="block bg-turf" style={{ width: `${mine}%` }} />
        <i className="block flex-1 bg-flag" />
      </div>
      <div className="mono flex justify-between text-[calc(10px*var(--ui-scale))] tracking-[0.06em]">
        <span className="text-turf">YOU {mine}%</span>
        <span className="text-flag">OPP {opponent}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ matchup detail */

function MatchupExpansion({ card }: { card: MatchupCard }) {
  const [benchOpen, setBenchOpen] = useState(false);
  const bench = card.mine.lineup?.bench ?? [];
  const opponentBench = card.opponent?.lineup?.bench ?? [];
  const flagged = bench.filter(isFlagged).length;

  return (
    <section
      className="flex flex-col gap-4 border-t border-ink-line pt-[14px]"
      aria-label={`${card.leagueName} week ${card.week} matchup`}
    >
      <StarterStateTable
        week={card.week}
        mine={card.starterStatus.mine}
        opponent={card.starterStatus.opponent}
      />
      <MirroredStarters mine={card.mine} opponent={card.opponent} />

      <div className="flex items-center justify-between gap-[10px]">
        <span className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.09em] text-stone">
          LINEUP CHANGES HAPPEN IN {card.platform.toUpperCase()}
        </span>
        <button
          type="button"
          onClick={() => setBenchOpen((value) => !value)}
          aria-expanded={benchOpen}
          className="mono cursor-pointer border-b border-ink-line text-[calc(10.5px*var(--ui-scale))] tracking-[0.08em] text-bone-dim"
        >
          {benchOpen ? "HIDE BENCH ↑" : "BENCH ↓"}
        </button>
      </div>

      {benchOpen && (
        <MirroredBench mine={bench} opponent={opponentBench} flagged={flagged} />
      )}

      <p className="mono text-[calc(9.5px*var(--ui-scale))] leading-relaxed tracking-[0.07em] text-stone">
        SCORES, PROJECTIONS, AND LINEUPS SYNC FROM {card.platform.toUpperCase()} · LAST PROVIDER SYNC{" "}
        {syncLabel(card.syncedAt)}
      </p>
    </section>
  );
}

function StarterStateTable({
  week,
  mine,
  opponent,
  leftLabel = "YOU",
  rightLabel = "OPP",
}: {
  week: number;
  mine: StarterSummary;
  opponent: StarterSummary | null;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const rows: { label: string; mine: number; opponent: number | undefined; live?: boolean }[] = [
    { label: "PLAYED", mine: mine.played, opponent: opponent?.played },
    { label: "LIVE", mine: mine.live, opponent: opponent?.live, live: true },
    { label: "TO PLAY", mine: mine.upcoming, opponent: opponent?.upcoming },
  ];

  return (
    <div className="overflow-hidden rounded-[5px] border border-ink-line">
      <div className="mono grid grid-cols-[minmax(0,1fr)_54px_54px] border-b border-ink-line bg-deep px-3 py-[9px] text-[calc(9.5px*var(--ui-scale))] text-stone">
        <span className="tracking-[0.11em]">WEEK {week} STARTERS</span>
        <span className="text-right tracking-[0.08em]">{leftLabel}</span>
        <span className="text-right tracking-[0.08em]">{rightLabel}</span>
      </div>
      {rows.map((row) => (
        <div
          className="mono grid grid-cols-[minmax(0,1fr)_54px_54px] border-b border-ink-line px-3 py-2 last:border-b-0"
          key={row.label}
        >
          <span className={`text-[calc(10.5px*var(--ui-scale))] tracking-[0.09em] ${row.live ? "text-amber" : "text-bone-dim"}`}>
            {row.label}
          </span>
          <span className="text-right text-[calc(11px*var(--ui-scale))] font-medium tabular-nums text-bone">{row.mine}</span>
          <span className="text-right text-[calc(11px*var(--ui-scale))] font-medium tabular-nums text-bone-dim">
            {row.opponent ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function MirroredStarters({
  mine,
  opponent,
  leftLabel = "YOU",
  rightLabel = "OPP",
}: {
  mine: Side;
  opponent: Side | null;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const mineStarters = mine.lineup?.starters ?? [];
  const opponentStarters = opponent?.lineup?.starters ?? [];
  const byOrder = new Map(mineStarters.map((player) => [player.lineupOrder, player]));
  const opponentByOrder = new Map(opponentStarters.map((player) => [player.lineupOrder, player]));
  // Provider slot order is canonical: keep the gaps rather than compacting the
  // two lineups against each other.
  const slots = Math.max(...byOrder.keys(), ...opponentByOrder.keys(), -1) + 1;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-3 border-b border-ink-line pb-[10px]">
        <div className="min-w-0">
          <div className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">{leftLabel}</div>
          <div className="display mt-[3px] truncate text-sm">{mine.name}</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">{rightLabel}</div>
          <div className="display mt-[3px] truncate text-sm text-bone-dim">
            {opponent?.name ?? "No opponent"}
          </div>
        </div>
      </div>

      {slots === 0 && <p className="py-3 text-xs text-bone-dim">No starters synced for this week.</p>}

      {Array.from({ length: slots }, (_, index) => {
        const left = byOrder.get(index);
        const right = opponentByOrder.get(index);
        return (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_62px_62px_minmax(0,1fr)] items-center gap-2 border-b border-ink-line py-[10px]"
          >
            <PlayerIdentity player={left} align="left" />
            <PlayerPoints player={left} align="right" tone="text-bone" />
            <PlayerPoints player={right} align="left" tone="text-bone-dim" />
            <PlayerIdentity player={right} align="right" />
          </div>
        );
      })}
    </div>
  );
}

function PlayerIdentity({ player, align }: { player: MatchupPlayer | undefined; align: "left" | "right" }) {
  if (!player) {
    return <span className={`mono text-[calc(10px*var(--ui-scale))] text-stone ${align === "right" ? "text-right" : ""}`}>—</span>;
  }
  // An unfilled starting slot is roster state worth seeing, not an absence to
  // paper over — it is the one thing on this card the manager can still fix.
  if (player.isEmptySlot) {
    return (
      <div className={`flex min-w-0 flex-col gap-[3px] ${align === "right" ? "items-end text-right" : ""}`}>
        <span className="mono truncate text-[calc(11px*var(--ui-scale))] tracking-[0.06em] text-stone">
          {align === "left" && <SlotTag slot={player.slot} side="left" />}
          EMPTY
          {align === "right" && <SlotTag slot={player.slot} side="right" />}
        </span>
      </div>
    );
  }

  const meta = [player.nflTeam, playerGameLabel(player), meaningfulStatus(player.injuryStatus)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`flex min-w-0 flex-col gap-[3px] ${align === "right" ? "items-end text-right" : ""}`}>
      <span
        className={`truncate text-[calc(12.5px*var(--ui-scale))] ${align === "left" ? "font-semibold text-bone" : "text-bone-dim"}`}
      >
        {align === "left" && <SlotTag slot={player.slot} side="left" />}
        {player.name}
        {align === "right" && <SlotTag slot={player.slot} side="right" />}
      </span>
      <span
        className={`mono truncate text-[calc(9px*var(--ui-scale))] tracking-[0.07em] ${player.game?.inProgress ? "text-amber" : "text-stone"}`}
      >
        {meta}
      </span>
    </div>
  );
}

function SlotTag({ slot, side }: { slot: string | null; side: "left" | "right" }) {
  return (
    <span
      className={`mono text-[calc(9px*var(--ui-scale))] tracking-[0.08em] text-stone ${side === "left" ? "mr-[6px]" : "ml-[6px]"}`}
    >
      {slotLabel(slot)}
    </span>
  );
}

function PlayerPoints({
  player,
  align,
  tone,
}: {
  player: MatchupPlayer | undefined;
  align: "left" | "right";
  tone: string;
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`mono text-[calc(13px*var(--ui-scale))] font-medium tabular-nums ${tone}`}>
        {numberLabel(player?.currentPoints ?? null)}
      </div>
      <div className="mono text-[calc(9.5px*var(--ui-scale))] tabular-nums text-stone">
        {numberLabel(player?.projectedPoints ?? null)}
      </div>
    </div>
  );
}

/**
 * Both benches, mirrored the way the starters above them are.
 *
 * The handoff design shows only your own bench, which answers "who could I
 * start" but not "what is coming at me" — the opponent's bench is where you
 * see the boom week you are about to lose to. Benches are paired by position
 * in each list rather than by lineup order: unlike starters, a bench has no
 * slots to align against, so row N is simply each side's Nth reserve.
 */
export function MirroredBench({
  mine,
  opponent,
  flagged,
}: {
  mine: MatchupPlayer[];
  opponent: MatchupPlayer[];
  flagged: number;
}) {
  const rows = Math.max(mine.length, opponent.length);
  const opponentFlagged = opponent.filter(isFlagged).length;

  return (
    <div className="flex flex-col gap-[9px] border-t border-ink-line pt-3">
      <div className="mono flex items-baseline justify-between gap-[10px] text-[calc(9.5px*var(--ui-scale))] text-stone">
        <span className="tracking-[0.13em]">BENCH</span>
        <span className="tracking-[0.1em]">
          YOU {mine.length}
          {flagged > 0 ? ` · ${flagged} FLAG` : ""} · OPP {opponent.length}
          {opponentFlagged > 0 ? ` · ${opponentFlagged} FLAG` : ""}
        </span>
      </div>

      {rows === 0 ? (
        <p className="rounded-[5px] border border-ink-line px-3 py-3 text-xs text-bone-dim">
          No bench players synced for this week.
        </p>
      ) : (
        <div className="flex flex-col">
          {Array.from({ length: rows }, (_, index) => {
            const left = mine[index];
            const right = opponent[index];
            // A flagged player on either side tints its own half only, so the
            // row still reads as two independent rosters.
            return (
              <div
                key={`${left?.externalPlayerId ?? "none"}:${right?.externalPlayerId ?? "none"}:${index}`}
                className="grid grid-cols-[minmax(0,1fr)_62px_62px_minmax(0,1fr)] items-center gap-2 border-b border-ink-line py-[10px] last:border-b-0"
              >
                <BenchIdentity player={left} align="left" />
                <BenchPoints player={left} align="right" tone="text-bone" />
                <BenchPoints player={right} align="left" tone="text-bone-dim" />
                <BenchIdentity player={right} align="right" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BenchIdentity({
  player,
  align,
}: {
  player: MatchupPlayer | undefined;
  align: "left" | "right";
}) {
  if (!player) {
    return (
      <span className={`mono text-[calc(10px*var(--ui-scale))] text-stone ${align === "right" ? "text-right" : ""}`}>
        —
      </span>
    );
  }

  const flagged = isFlagged(player);
  const meta = [player.nflTeam, playerGameLabel(player), meaningfulStatus(player.injuryStatus)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`flex min-w-0 flex-col gap-[3px] ${align === "right" ? "items-end text-right" : ""}`}>
      <span
        className={`truncate text-[calc(12.5px*var(--ui-scale))] ${align === "left" ? "font-semibold text-bone" : "text-bone-dim"}`}
      >
        {align === "left" && <SlotTag slot={player.position ?? player.slot} side="left" />}
        {player.name}
        {align === "right" && <SlotTag slot={player.position ?? player.slot} side="right" />}
      </span>
      <span
        className={`mono truncate text-[calc(9px*var(--ui-scale))] tracking-[0.07em] ${flagged ? "text-flag" : "text-stone"}`}
      >
        {meta}
      </span>
    </div>
  );
}

/** Bench players have not played, so the projection is the number that matters. */
function BenchPoints({
  player,
  align,
  tone,
}: {
  player: MatchupPlayer | undefined;
  align: "left" | "right";
  tone: string;
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`mono text-[calc(12px*var(--ui-scale))] font-medium tabular-nums ${tone}`}>
        {numberLabel(player?.projectedPoints ?? null)}
      </div>
      <div className="mono text-[calc(9px*var(--ui-scale))] tracking-[0.09em] text-stone">PROJ</div>
    </div>
  );
}


/* ------------------------------------------------------------- league detail */

function LeagueExpansion({ card }: { card: MatchupCard }) {
  const [view, setView] = useState<"matchups" | "standings">("matchups");

  return (
    <section
      className="flex flex-col gap-3 border-t border-ink-line pt-[14px]"
      aria-label={`${card.leagueName} week ${card.week} league scoreboard`}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.13em] text-stone">ALL MATCHUPS</span>
          <span className="text-[calc(13px*var(--ui-scale))] text-bone-dim">Open any game for its synced lineup</span>
        </div>
        <span className="mono shrink-0 text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">WEEK {card.week}</span>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-[4px] border border-ink-line" role="tablist">
        <Tab label="MATCHUPS" active={view === "matchups"} onSelect={() => setView("matchups")} />
        <Tab label="STANDINGS" active={view === "standings"} onSelect={() => setView("standings")} border />
      </div>

      {view === "matchups" ? (
        <div className="overflow-hidden rounded-[5px] border border-ink-line">
          {card.scoreboard.map((game) => (
            <ScoreboardGame key={game.key} game={game} week={card.week} />
          ))}
          {card.scoreboard.length === 0 && (
            <p className="px-3 py-3 text-xs text-bone-dim">
              League matchups appear when {card.platform} publishes Week {card.week}.
            </p>
          )}
        </div>
      ) : (
        <LeagueStandings card={card} />
      )}

      <p className="mono text-[calc(9.5px*var(--ui-scale))] leading-relaxed tracking-[0.07em] text-stone">
        SCORES, PROJECTIONS, AND LINEUPS SYNC FROM {card.platform.toUpperCase()} · LAST PROVIDER SYNC{" "}
        {syncLabel(card.syncedAt)}
      </p>
    </section>
  );
}

function Tab({
  label,
  active,
  onSelect,
  border = false,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  border?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`mono min-h-11 cursor-pointer px-2 py-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.1em] ${border ? "border-l border-ink-line" : ""} ${active ? "bg-bone text-ink" : "text-bone-dim hover:bg-ink"}`}
    >
      {label}
    </button>
  );
}

function ScoreboardGame({ game, week }: { game: LeagueScoreboardGame; week: number }) {
  const includesMine = game.left.isMine || Boolean(game.right?.isMine);
  const leftLabel = game.left.isMine ? "YOU" : game.right?.isMine ? "OPP" : "TEAM 1";
  const rightLabel = game.right?.isMine ? "YOU" : game.left.isMine ? "OPP" : "TEAM 2";

  return (
    <details className={`border-b border-ink-line last:border-b-0 ${includesMine ? "bg-deep" : ""}`}>
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[10px] px-[13px] py-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span
            className={`truncate text-[calc(13px*var(--ui-scale))] ${game.left.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}
          >
            {game.left.name}
          </span>
          {game.left.isMine && (
            <span className="mono text-[calc(9px*var(--ui-scale))] tracking-[0.12em] text-amber">YOU</span>
          )}
        </div>
        <div className="flex items-start gap-[9px]">
          <GameScore points={game.left.points} projected={game.left.projected} isFinal={game.isFinal} />
          <span className="mono pt-[2px] text-[calc(11px*var(--ui-scale))] text-stone">·</span>
          <GameScore
            points={game.right?.points ?? null}
            projected={game.right?.projected ?? null}
            isFinal={game.isFinal}
            align="left"
          />
        </div>
        <div className="flex min-w-0 flex-col items-end gap-[3px]">
          <span
            className={`truncate text-right text-[calc(13px*var(--ui-scale))] ${game.right?.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}
          >
            {game.right?.name ?? "Bye"}
          </span>
          {game.right?.isMine && (
            <span className="mono text-[calc(9px*var(--ui-scale))] tracking-[0.12em] text-amber">YOU</span>
          )}
        </div>
      </summary>
      <div className="border-t border-ink-line px-[13px] pt-3 pb-4">
        <div className="mono flex items-center justify-between pb-3 text-[calc(9px*var(--ui-scale))] tracking-[0.08em] text-stone">
          <span>{game.isLive ? "LIVE" : game.isFinal ? "FINAL" : "PREGAME"}</span>
        </div>
        <StarterStateTable
          week={week}
          mine={game.left.starterStatus}
          opponent={game.right?.starterStatus ?? null}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
        <div className="mt-4">
          <MirroredStarters
            mine={game.left}
            opponent={game.right}
            leftLabel={leftLabel}
            rightLabel={rightLabel}
          />
        </div>
      </div>
    </details>
  );
}

function GameScore({
  points,
  projected,
  isFinal,
  align = "right",
}: {
  points: number | null;
  projected: number | null;
  isFinal: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="mono text-[calc(14px*var(--ui-scale))] font-medium tabular-nums text-bone">
        {points === null ? "—" : points.toFixed(1)}
      </div>
      {!isFinal && (
        <>
          <div className="mono mt-[3px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.09em] text-stone">PROJ</div>
          <div className="mono text-[calc(9.5px*var(--ui-scale))] tabular-nums text-stone">
            {projected === null ? "—" : projected.toFixed(1)}
          </div>
        </>
      )}
    </div>
  );
}

function LeagueStandings({ card }: { card: MatchupCard }) {
  // Every team at 0-0 makes a numbered rank meaningless, so suppress it.
  const hasActivity = card.standings.some(
    (team) => team.wins > 0 || team.losses > 0 || team.ties > 0 || (team.pointsFor ?? 0) > 0
  );
  if (!hasActivity) {
    return (
      <div className="rounded-[5px] border border-ink-line px-[13px] py-4" role="tabpanel">
        <p className="text-xs text-bone">Standings begin when league play starts.</p>
        <p className="mt-1 text-xs text-bone-dim">
          Slate shows the provider-synced rank, record, and points here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[5px] border border-ink-line" role="tabpanel">
      <div className="mono grid grid-cols-[26px_minmax(0,1fr)_58px_62px] gap-2 border-b border-ink-line bg-deep px-[13px] py-[9px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.1em] text-stone">
        <span>#</span>
        <span>TEAM</span>
        <span className="text-right">REC</span>
        <span className="text-right">PTS</span>
      </div>
      {card.standings.map((team, index) => (
        <div
          key={team.teamId}
          className={`grid grid-cols-[26px_minmax(0,1fr)_58px_62px] items-center gap-2 border-b border-ink-line px-[13px] py-[11px] last:border-b-0 ${team.isMine ? "bg-deep" : ""}`}
        >
          <span className="mono text-[calc(10.5px*var(--ui-scale))] text-stone">{team.standing ?? index + 1}</span>
          <span
            className={`truncate text-[calc(13px*var(--ui-scale))] ${team.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}
          >
            {team.name}
          </span>
          <span className="mono text-right text-[calc(11px*var(--ui-scale))] font-medium tabular-nums text-bone-dim">
            {recordLabel(team.wins, team.losses, team.ties)}
          </span>
          <span className="mono text-right text-[calc(11px*var(--ui-scale))] font-medium tabular-nums text-bone">
            {team.pointsFor?.toFixed(1) ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- chopped */

function ChoppedBody({ card }: { card: MatchupCard }) {
  const [open, setOpen] = useState(false);
  const summary = card.chopped;
  const mine = summary?.standings.find((team) => team.isMine) ?? null;
  const chop = summary?.chopZone ?? null;
  const total = summary?.standings.length ?? card.teamCount ?? 0;

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">SURVIVAL RANK</div>
          <div className="display mt-1 text-[calc(26px*var(--ui-scale))] leading-none">
            {summary?.myRank ?? "—"}
            <span className="text-sm text-bone-dim">/{total || "—"}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">PROJECTED</div>
          <div className="display mt-[5px] text-[calc(20px*var(--ui-scale))] leading-none tabular-nums">
            {mine?.projected?.toFixed(1) ?? mine?.points?.toFixed(1) ?? "—"}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[11px] border-t border-ink-line pt-[11px]">
        <span className="mono text-[calc(10.5px*var(--ui-scale))] tracking-[0.06em] text-bone-dim">
          CHOP ZONE: <span className="text-flag">{chop?.name ?? "Waiting for scores"}</span>
          {summary?.marginAboveChop !== null && summary?.marginAboveChop !== undefined
            ? ` · +${summary.marginAboveChop.toFixed(1)} CLEAR`
            : ""}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="mono min-h-11 cursor-pointer rounded-[4px] border border-ink-line px-[10px] py-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.09em] text-bone hover:bg-ink"
        >
          {open ? "HIDE CHOPPING BLOCK ↑" : "CHOPPING BLOCK ↓"}
        </button>
      </div>

      {open && <ChoppingBlock card={card} />}
    </>
  );
}

function ChoppingBlock({ card }: { card: MatchupCard }) {
  // choppedSummary sorts lowest first — the ladder is drawn the same way, so
  // the chop line sits above the last row.
  const standings = card.chopped?.standings ?? [];
  const ordered = [...standings].reverse();
  const margin = card.chopped?.marginAboveChop ?? null;

  return (
    <section className="flex flex-col gap-3 border-t border-ink-line pt-[13px]" aria-label="Chopping block">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.13em] text-stone">CHOPPING BLOCK</span>
          <span className="text-[calc(13px*var(--ui-scale))] text-bone-dim">Lowest score at final whistle is out</span>
        </div>
        <span className="mono shrink-0 text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">
          WEEK {card.week} · {standings.length} LEFT
        </span>
      </div>

      <div className="overflow-hidden rounded-[5px] border border-ink-line">
        <div className="mono grid grid-cols-[24px_minmax(0,1fr)_62px_62px] gap-2 border-b border-ink-line bg-deep px-[13px] py-[9px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.1em] text-stone">
          <span>#</span>
          <span>TEAM</span>
          <span className="text-right">LIVE</span>
          <span className="text-right">PROJ</span>
        </div>
        {ordered.map((team, index) => {
          const chopped = index === ordered.length - 1;
          return (
            <div key={team.teamId}>
              {chopped && (
                <div className="flex items-center gap-[9px] border-b border-ink-line bg-deep px-[13px] py-[7px]">
                  <span className="mono shrink-0 text-[calc(9px*var(--ui-scale))] tracking-[0.13em] text-flag">CHOP LINE</span>
                  <span className="h-px flex-1 bg-flag opacity-55" aria-hidden />
                  <span className="mono shrink-0 text-[calc(9px*var(--ui-scale))] tracking-[0.09em] text-stone">SAFE ABOVE</span>
                </div>
              )}
              <div
                className={`grid grid-cols-[24px_minmax(0,1fr)_62px_62px] items-center gap-2 border-b border-ink-line px-[13px] py-[11px] last:border-b-0 ${team.isMine ? "bg-deep" : ""}`}
              >
                <span className={`mono text-[calc(10.5px*var(--ui-scale))] ${chopped ? "text-flag" : "text-stone"}`}>
                  {index + 1}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`truncate text-[calc(13px*var(--ui-scale))] ${chopped ? "font-semibold text-flag" : team.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}
                  >
                    {team.name}
                  </span>
                  {team.isMine && (
                    <span className="mono shrink-0 text-[calc(9px*var(--ui-scale))] tracking-[0.11em] text-amber">YOU</span>
                  )}
                  {chopped && !team.isMine && (
                    <span className="mono shrink-0 text-[calc(9px*var(--ui-scale))] tracking-[0.11em] text-flag">CHOP ZONE</span>
                  )}
                </div>
                <span className="mono text-right text-[calc(12px*var(--ui-scale))] font-medium tabular-nums text-bone-dim">
                  {team.points?.toFixed(1) ?? "—"}
                </span>
                <span
                  className={`mono text-right text-[calc(12px*var(--ui-scale))] font-medium tabular-nums ${chopped ? "text-flag" : "text-bone"}`}
                >
                  {team.projected?.toFixed(1) ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
        {ordered.length === 0 && (
          <p className="px-[13px] py-3 text-xs text-bone-dim">
            The ladder appears when {card.platform} publishes Week {card.week} scores.
          </p>
        )}
      </div>

      <div className="mono flex items-center justify-between gap-[10px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.09em]">
        <span className="text-stone">YOUR MARGIN TO THE LINE</span>
        <span className={`text-[calc(11px*var(--ui-scale))] font-medium tabular-nums ${margin !== null && margin >= 0 ? "text-turf" : "text-flag"}`}>
          {margin === null ? "—" : `${margin >= 0 ? "+" : ""}${margin.toFixed(1)}`}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ box score */

interface BoxScoreRow {
  label: string;
  mine: number;
  opponent: number;
}

/** Groups both starting lineups by position — the shape of a settled week. */
export function buildBoxScore(mine: MatchupPlayer[], opponent: MatchupPlayer[]): BoxScoreRow[] {
  const groups: { label: string; positions: string[] }[] = [
    { label: "QB", positions: ["QB"] },
    { label: "RB", positions: ["RB"] },
    { label: "WR", positions: ["WR"] },
    { label: "TE", positions: ["TE"] },
    { label: "K / DEF", positions: ["K", "DEF", "DST"] },
  ];
  const sum = (players: MatchupPlayer[], positions: string[]) =>
    players
      .filter((player) => positions.includes((player.position ?? "").toUpperCase()))
      .reduce((total, player) => total + (player.currentPoints ?? 0), 0);
  const totals = (players: MatchupPlayer[]) =>
    players.reduce((total, player) => total + (player.currentPoints ?? 0), 0);

  return [
    ...groups.map((group) => ({
      label: group.label,
      mine: sum(mine, group.positions),
      opponent: sum(opponent, group.positions),
    })),
    { label: "TOTAL", mine: totals(mine), opponent: totals(opponent) },
  ];
}

function FinalBoxScore({ card }: { card: MatchupCard }) {
  const mineStarters = card.mine.lineup?.starters ?? [];
  const opponentStarters = card.opponent?.lineup?.starters ?? [];
  const rows = buildBoxScore(mineStarters, opponentStarters);
  const won = (card.mine.points ?? 0) >= (card.opponent?.points ?? 0);
  const top = [...mineStarters, ...opponentStarters]
    .filter((player) => !player.isEmptySlot)
    .sort((a, b) => (b.currentPoints ?? 0) - (a.currentPoints ?? 0))[0];

  return (
    <section className="flex flex-col gap-3 border-t border-ink-line pt-[13px]" aria-label="Final box score">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.13em] text-stone">FINAL BOX SCORE</span>
          <span className="text-[calc(13px*var(--ui-scale))] text-bone-dim">Locked when the last game ended</span>
        </div>
        <span className="mono shrink-0 text-[calc(9.5px*var(--ui-scale))] tracking-[0.11em] text-stone">WEEK {card.week}</span>
      </div>

      <div className="overflow-hidden rounded-[5px] border border-ink-line">
        <div className="mono grid grid-cols-[minmax(0,1fr)_58px_58px] gap-2 border-b border-ink-line bg-deep px-3 py-[9px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.1em] text-stone">
          <span>BY POSITION</span>
          <span className="truncate text-right">YOU</span>
          <span className="truncate text-right">OPP</span>
        </div>
        {rows.map((row) => {
          const total = row.label === "TOTAL";
          return (
            <div
              key={row.label}
              className={`mono grid grid-cols-[minmax(0,1fr)_58px_58px] items-center gap-2 border-b border-ink-line px-3 py-[10px] last:border-b-0 ${total ? "bg-deep" : ""}`}
            >
              <span
                className={`text-[calc(10.5px*var(--ui-scale))] tracking-[0.09em] ${total ? "font-medium text-bone" : "text-bone-dim"}`}
              >
                {row.label}
              </span>
              <span
                className={`text-right text-[calc(11.5px*var(--ui-scale))] font-medium tabular-nums ${total && won ? "text-turf" : "text-bone"}`}
              >
                {row.mine.toFixed(1)}
              </span>
              <span
                className={`text-right text-[calc(11.5px*var(--ui-scale))] font-medium tabular-nums ${total && !won ? "text-turf" : "text-bone-dim"}`}
              >
                {row.opponent.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mono flex items-center justify-between gap-[10px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.09em] text-stone">
        <span className="truncate">
          {top ? `TOP SCORER · ${top.name.toUpperCase()} ${numberLabel(top.currentPoints)}` : "NO LINEUP SYNCED"}
        </span>
        <span className="mono shrink-0 text-[calc(10.5px*var(--ui-scale))] tracking-[0.08em] text-turf">
          {recordLabel(
            card.standings.find((team) => team.isMine)?.wins ?? 0,
            card.standings.find((team) => team.isMine)?.losses ?? 0,
            card.standings.find((team) => team.isMine)?.ties ?? 0
          )}
        </span>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- other states */

function ByeBody({ card }: { card: MatchupCard }) {
  return (
    <>
      <p className="max-w-[68ch] text-[calc(13px*var(--ui-scale))] leading-relaxed text-bone-dim">
        No opponent this week — an odd team count means you sit out week {card.week}. Your score still
        counts toward the points-for tiebreak.
      </p>
      <span className="mono border-t border-ink-line pt-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.06em] text-stone">
        NEXT GAME WEEK {card.week + 1}
      </span>
    </>
  );
}

function PreDraftBody({ card }: { card: MatchupCard }) {
  return (
    <>
      <p className="max-w-[68ch] text-[calc(13px*var(--ui-scale))] leading-relaxed text-bone-dim">
        Nothing to score yet. Slate fills this card the moment picks start.
        {card.leagueFormat === "chopped"
          ? " The Chopping Block appears after the draft."
          : " Matchups and projections appear after the draft."}
      </p>
      <div className="mono flex items-center justify-between gap-[10px] border-t border-ink-line pt-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.06em] text-stone">
        <span className="truncate">{card.mine.teamId ? card.mine.name.toUpperCase() : "ROSTER PENDING"}</span>
        <span>{card.teamCount ? `${card.teamCount} TEAMS` : ""}</span>
      </div>
    </>
  );
}

function FailedBody({
  card,
  onOpenConnections,
  onRetrySync,
}: {
  card: MatchupCard;
  onOpenConnections?: () => void;
  onRetrySync?: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      if (onRetrySync) await onRetrySync();
      else {
        await fetch("/api/live/sync", { method: "POST", cache: "no-store" });
        window.location.reload();
      }
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <p className="max-w-[68ch] text-[calc(13px*var(--ui-scale))] leading-relaxed text-bone-dim">
        {retrying
          ? `Retrying now — reconnecting to ${title(card.platform)}.`
          : `${title(card.platform)} stopped returning this league ${syncLabel(card.syncFailure?.at ?? null)}. Scores below are from the last good sync.`}
      </p>
      <div className="flex items-center gap-2 border-t border-ink-line pt-[11px]">
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="mono min-h-11 flex-1 cursor-pointer rounded-[4px] border border-flag px-[10px] py-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.09em] text-flag disabled:cursor-wait"
        >
          {retrying ? "RETRYING…" : "RETRY SYNC"}
        </button>
        <button
          type="button"
          onClick={onOpenConnections}
          className="mono min-h-11 flex-1 cursor-pointer rounded-[4px] border border-ink-line px-[10px] py-[11px] text-[calc(10.5px*var(--ui-scale))] tracking-[0.09em] text-bone-dim"
        >
          CONNECTIONS
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- helpers */

function isFlagged(player: MatchupPlayer): boolean {
  const status = meaningfulStatus(player.injuryStatus);
  return status !== null && status !== "HEALTHY";
}

function meaningfulStatus(status: string | null): string | null {
  if (!status || status.toLowerCase() === "active") return null;
  return status.toUpperCase();
}

function slotLabel(slot: string | null): string {
  return slot?.replace("SUPER_FLEX", "SFLX") ?? "—";
}

function numberLabel(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function recordLabel(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function title(platform: MatchupCard["platform"]): string {
  return platform === "espn" ? "ESPN" : platform === "yahoo" ? "Yahoo" : "Sleeper";
}

export function marginLabel(diff: number, isFinal: boolean): string {
  const amount = Math.abs(diff).toFixed(1);
  if (diff === 0) return isFinal ? "tied" : "level";
  if (isFinal) return diff > 0 ? `won by ${amount}` : `lost by ${amount}`;
  return diff > 0 ? `up ${amount}` : `down ${amount}`;
}

function syncLabel(iso: string | null): string {
  if (!iso) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })
    .format(new Date(iso))
    .toUpperCase();
}
