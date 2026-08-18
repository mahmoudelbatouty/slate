"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  type LeagueScoreboardGame,
  type MatchupCard,
  type MatchupPlayer,
  type Side,
} from "@/lib/matchup";
import type { StarterSummary } from "@/lib/game-state";
import { playerGameLabel } from "@/lib/player-state";
import { PlatformMark } from "@/components/PlatformMark";

/**
 * Color means game state and nothing else — see DESIGN.md. Platform identity
 * stays neutral: an official monochrome mark where available, otherwise the
 * compact monogram fallback.
 */
export function LeagueCard({
  card,
  reorderHandle,
}: {
  card: MatchupCard;
  reorderHandle?: ReactNode;
}) {
  const [matchupExpanded, setMatchupExpanded] = useState(false);
  const [scoreboardExpanded, setScoreboardExpanded] = useState(false);
  const mine = card.mine.points ?? 0;
  const theirs = card.opponent?.points ?? 0;
  const diff = mine - theirs;

  const total = mine + theirs;

  return (
    <article className={`${matchupExpanded || scoreboardExpanded ? "" : "group/card"} border border-ink-line bg-ink-raised px-4 pt-[15px] pb-[13px]`}>
      <div className="mb-[15px] flex items-center gap-[10px]">
        {reorderHandle}
        <PlatformMark platform={card.platform} />
        <div className="min-w-0 flex-1" title={card.leagueName}>
          <span className={`display block text-sm font-bold ${card.leagueFormat === "chopped" ? "leading-tight" : "truncate"}`}>
            {card.leagueName}
          </span>
          <span className="mono mt-1 block text-[9px] tracking-[0.12em] text-bone-dim">
            {card.leagueFormat === "chopped" ? "CHOPPED · " : ""}{card.leagueType.toUpperCase()}
          </span>
        </div>
        {card.leagueStatus === "pre_draft" ? (
          <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">PRE-DRAFT</span>
        ) : (
          <StateLabel isFinal={card.isFinal} isLive={card.isLive} hasScore={total > 0} />
        )}
      </div>

      {card.leagueStatus === "pre_draft" ? (
        <PreDraft card={card} />
      ) : card.leagueFormat === "chopped" ? (
        <ChoppedLeague card={card} expanded={matchupExpanded} setExpanded={setMatchupExpanded} />
      ) : (
        <>

          <Row side={card.mine} isMine diff={diff} isFinal={card.isFinal} />

          <div className="my-[14px] h-px bg-ink-line" />

          <Row side={card.opponent} isMine={false} diff={0} isFinal={card.isFinal} />

          <WinProbabilityBar
            probability={card.winProbability}
            fallback={marginLabel(diff, card.isFinal, total)}
          />

          <div className="mt-[12px] border-t border-ink-line pt-[10px] text-2xs text-bone-dim">
            <StarterAvailability
              leagueId={card.leagueId}
              week={card.week}
              mine={card.starterStatus.mine}
              opponent={card.starterStatus.opponent}
            />
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 border border-ink-line px-3 py-2 text-center text-2xs text-bone hover:bg-ink focus-visible:outline-2 focus-visible:outline-amber"
                aria-expanded={matchupExpanded}
                aria-controls={`matchup-detail-${card.leagueId}`}
                onClick={() => setMatchupExpanded((value) => !value)}
              >
                {matchupExpanded ? "HIDE MATCHUP ↑" : "VIEW MATCHUP ↓"}
              </button>
              <button
                type="button"
                className="min-h-11 border border-ink-line px-3 py-2 text-center text-2xs text-bone hover:bg-ink focus-visible:outline-2 focus-visible:outline-amber"
                aria-expanded={scoreboardExpanded}
                aria-controls={`league-scoreboard-${card.leagueId}`}
                onClick={() => setScoreboardExpanded((value) => !value)}
              >
                {scoreboardExpanded ? "HIDE LEAGUE ↑" : "LEAGUE SCORES ↓"}
              </button>
            </div>
          </div>
          {matchupExpanded ? <MatchupDetail card={card} /> : null}
          {scoreboardExpanded ? <LeagueScoreboard card={card} /> : null}
        </>
      )}
      {card.platform === "yahoo" ? (
        <a
          className="mono mt-3 block text-right text-[9px] tracking-[0.08em] text-bone-dim underline-offset-2 hover:text-bone hover:underline focus-visible:outline-2 focus-visible:outline-amber"
          href="https://football.fantasysports.yahoo.com/"
          target="_blank"
          rel="noreferrer"
        >
          Fantasy data provided by Yahoo Fantasy
        </a>
      ) : null}
    </article>
  );
}

function LeagueScoreboard({ card }: { card: MatchupCard }) {
  const [view, setView] = useState<"matchups" | "standings">("matchups");
  return (
    <section
      id={`league-scoreboard-${card.leagueId}`}
      className="mt-4 border-t border-ink-line pt-4"
      aria-label={`${card.leagueName} Week ${card.week} league scoreboard`}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="mono text-[9px] tracking-[0.1em] text-bone">ALL MATCHUPS</p>
          <p className="text-xs text-bone-dim">Open any game for its synced lineup</p>
        </div>
        <span className="mono shrink-0 text-[9px] text-stone">WEEK {card.week}</span>
      </div>
      <div className="mb-2 grid grid-cols-2 border border-ink-line" role="tablist" aria-label="League view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "matchups"}
          className={`min-h-10 px-3 text-2xs focus-visible:outline-2 focus-visible:outline-amber ${view === "matchups" ? "bg-bone text-ink" : "text-bone hover:bg-ink"}`}
          onClick={() => setView("matchups")}
        >
          MATCHUPS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "standings"}
          className={`min-h-10 border-l border-ink-line px-3 text-2xs focus-visible:outline-2 focus-visible:outline-amber ${view === "standings" ? "bg-bone text-ink" : "text-bone hover:bg-ink"}`}
          onClick={() => setView("standings")}
        >
          STANDINGS
        </button>
      </div>
      {view === "matchups" ? (
        <div className="border border-ink-line bg-ink">
          {card.scoreboard.map((game) => (
            <ScoreboardGame key={game.key} game={game} />
          ))}
        </div>
      ) : (
        <LeagueStandings card={card} />
      )}
      {view === "matchups" && card.scoreboard.length === 0 ? (
        <p className="py-3 text-xs text-bone-dim">
          League matchups will appear when {card.platform} publishes Week {card.week}.
        </p>
      ) : null}
      <p className="mono mt-3 text-[9px] leading-relaxed text-stone">
        SCORES, PROJECTIONS, AND LINEUPS SYNC FROM {card.platform.toUpperCase()} · LAST PROVIDER SYNC {syncLabel(card.syncedAt)}
      </p>
    </section>
  );
}

function LeagueStandings({ card }: { card: MatchupCard }) {
  const hasActivity = card.standings.some((team) =>
    team.wins > 0 || team.losses > 0 || team.ties > 0 || (team.pointsFor ?? 0) > 0 || (team.pointsAgainst ?? 0) > 0
  );
  if (!hasActivity) {
    return (
      <div className="border border-ink-line bg-ink px-3 py-4" role="tabpanel" aria-label={`${card.leagueName} standings`}>
        <p className="text-xs text-bone">Standings begin when league play starts.</p>
        <p className="mt-1 text-xs text-bone-dim">Slate will show the provider-synced rank, record, and points here automatically.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden border border-ink-line bg-ink" role="tabpanel" aria-label={`${card.leagueName} standings`}>
      <div className="mono grid grid-cols-[28px_minmax(0,1fr)_44px_62px] gap-2 px-3 py-2 text-[8px] tracking-[0.08em] text-stone">
        <span>RK</span><span>TEAM</span><span className="text-right">REC</span><span className="text-right">PF</span>
      </div>
      <ol>
        {card.standings.map((team) => (
          <li
            key={team.teamId}
            className={`grid grid-cols-[28px_minmax(0,1fr)_44px_62px] items-center gap-2 border-t border-ink-line px-3 py-2 ${team.isMine ? "bg-bone/5" : ""}`}
          >
            <span className="mono text-[10px] text-stone">{team.standing ?? "—"}</span>
            <span className={`min-w-0 truncate text-xs ${team.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}>
              {team.name}{team.isMine ? " · YOU" : ""}
            </span>
            <span className="mono text-right text-[10px] text-bone">{recordLabel(team.wins, team.losses, team.ties)}</span>
            <span className="mono text-right text-[10px] tabular-nums text-bone">{team.pointsFor?.toFixed(1) ?? "—"}</span>
          </li>
        ))}
      </ol>
      {card.standings.length === 0 ? <p className="px-3 py-3 text-xs text-bone-dim">Standings have not synced yet.</p> : null}
    </div>
  );
}

function recordLabel(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function ScoreboardGame({ game }: { game: LeagueScoreboardGame }) {
  const includesMine = game.left.isMine || Boolean(game.right?.isMine);
  const leftLabel = game.left.isMine ? "YOU" : game.right?.isMine ? "OPP" : "TEAM 1";
  const rightLabel = game.right?.isMine ? "YOU" : game.left.isMine ? "OPP" : "TEAM 2";
  return (
    <details className={`group/game border-t border-ink-line first:border-t-0 ${includesMine ? "bg-bone/5" : ""}`}>
      <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-amber">
        <ScoreboardIdentity team={game.left} align="left" />
        <div className="mono grid grid-cols-[42px_12px_42px] items-center text-center tabular-nums">
          <span className="text-base text-bone">{scoreLabel(game.left.points)}</span>
          <span className="text-[8px] text-stone">–</span>
          <span className="text-base text-bone">{scoreLabel(game.right?.points ?? null)}</span>
          <span className="text-[8px] text-stone">{game.isFinal ? "FINAL" : "PROJ"}</span>
          <span />
          <span className="text-[8px] text-stone">{game.isFinal ? "FINAL" : "PROJ"}</span>
          {!game.isFinal ? <span className="text-[10px] text-bone-dim">{scoreLabel(game.left.projected)}</span> : <span />}
          <span />
          {!game.isFinal ? <span className="text-[10px] text-bone-dim">{scoreLabel(game.right?.projected ?? null)}</span> : <span />}
        </div>
        <ScoreboardIdentity team={game.right} align="right" />
      </summary>
      <div className="border-t border-ink-line px-3 pb-4">
        <div className="mono flex items-center justify-between py-2 text-[8px] tracking-[0.08em] text-stone">
          <span>{game.isLive ? "LIVE" : game.isFinal ? "FINAL" : "PREGAME"}</span>
          <span className="group-open/game:hidden">OPEN LINEUPS ↓</span>
          <span className="hidden group-open/game:inline">CLOSE LINEUPS ↑</span>
        </div>
        <WeeklySummary
          mine={game.left.starterStatus}
          opponent={game.right?.starterStatus ?? null}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
        <HeadToHeadLineups
          mine={game.left}
          opponent={game.right}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
      </div>
    </details>
  );
}

function ScoreboardIdentity({ team, align }: { team: LeagueScoreboardGame["left"] | null; align: "left" | "right" }) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className={`truncate text-xs ${team?.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}>
        {team?.name ?? "Bye"}
      </p>
      <p className="mono mt-1 text-[8px] text-stone">{team?.isMine ? "YOU" : ""}</p>
    </div>
  );
}

function scoreLabel(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function ChoppedLeague({
  card,
  expanded,
  setExpanded,
}: {
  card: MatchupCard;
  expanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const summary = card.chopped;
  const mine = summary?.standings.find((team) => team.isMine) ?? null;
  const chop = summary?.chopZone ?? null;
  const total = summary?.standings.length ?? 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="mono text-[9px] tracking-[0.08em] text-stone">YOUR SURVIVAL RANK</p>
          <p className="display mt-1 text-[27px] leading-none text-bone">
            {summary?.myRank ?? "—"}<span className="ml-1 text-sm text-bone-dim">/ {total || "—"}</span>
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-bone">{card.mine.name}</p>
          <p className="mono mt-1 text-2xs text-bone-dim">
            {card.isFinal ? "final" : `proj ${mine?.projected?.toFixed(1) ?? "—"}`}
          </p>
        </div>
        <div className="min-w-0 border-l border-ink-line pl-3 text-right">
          <p className="mono text-[9px] tracking-[0.08em] text-flag">CHOP ZONE</p>
          <p className="display mt-1 text-[27px] leading-none text-flag">
            {chop?.projected?.toFixed(1) ?? chop?.points?.toFixed(1) ?? "—"}
          </p>
          <p className="mt-2 truncate text-sm text-bone-dim">{chop?.name ?? "Waiting for scores"}</p>
          <p className="mono mt-1 text-2xs text-bone-dim">
            {summary?.marginAboveChop === null || summary?.marginAboveChop === undefined
              ? "margin —"
              : `${summary.marginAboveChop.toFixed(1)} pts above`}
          </p>
        </div>
      </div>

      <div className="mt-[14px] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-ink-line pt-[10px] text-2xs text-bone-dim">
        <span className="mono">{total || card.teamCount || "—"} TEAMS · LOW SCORE IS CHOPPED</span>
        <button
          type="button"
          className="min-h-11 shrink-0 border border-ink-line px-3 py-2 text-left text-2xs text-bone hover:bg-ink focus-visible:outline-2 focus-visible:outline-amber"
          aria-expanded={expanded}
          aria-controls={`chopped-detail-${card.leagueId}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "HIDE STANDINGS ↑" : "VIEW STANDINGS ↓"}
        </button>
      </div>
      {expanded ? <ChoppedStandings card={card} /> : null}
    </>
  );
}

function ChoppedStandings({ card }: { card: MatchupCard }) {
  const standings = card.chopped?.standings ?? [];
  return (
    <section
      id={`chopped-detail-${card.leagueId}`}
      className="mt-4 border-t border-ink-line pt-4"
      aria-label={`${card.leagueName} Week ${card.week} Chopping Block`}
    >
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="mono text-[9px] tracking-[0.1em] text-flag">CHOPPING BLOCK</p>
          <p className="text-xs text-bone-dim">Lowest projected score first</p>
        </div>
        <span className="mono text-[9px] text-stone">WEEK {card.week}</span>
      </div>
      <ol className="border border-ink-line bg-ink">
        {standings.map((team, index) => (
          <li
            key={team.teamId}
            className={`grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 border-t border-ink-line px-3 py-2 first:border-t-0 ${team.isMine ? "bg-bone/5" : ""}`}
          >
            <span className={`mono text-[9px] ${index === 0 ? "text-flag" : "text-stone"}`}>
              {index === 0 ? "CUT" : index + 1}
            </span>
            <span className={`truncate text-xs ${team.isMine ? "font-semibold text-bone" : "text-bone-dim"}`}>
              {team.name}{team.isMine ? " · YOU" : ""}
            </span>
            <span className="mono tabular-nums text-xs text-bone">
              {team.projected?.toFixed(1) ?? team.points?.toFixed(1) ?? "—"}
            </span>
          </li>
        ))}
      </ol>
      {standings.length === 0 ? (
        <p className="py-3 text-xs text-bone-dim">Standings will appear when Sleeper publishes Week {card.week} scores.</p>
      ) : null}
    </section>
  );
}

function WinProbabilityBar({
  probability,
  fallback,
}: {
  probability: number | null;
  fallback: string;
}) {
  if (probability === null) {
    return (
      <div className="mono mt-[14px]" aria-label={`Win probability unavailable, ${fallback}`}>
        <div className="mb-1.5 flex items-center justify-between text-[9px] text-bone-dim">
          <span>WIN ODDS UNAVAILABLE</span>
          <span>{fallback.toUpperCase()}</span>
        </div>
        <div className="h-1 bg-ink-line" />
      </div>
    );
  }

  const mine = Math.max(0, Math.min(100, Math.round(probability)));
  const opponent = 100 - mine;
  const tied = mine === opponent;
  const mineTone = tied ? "text-stone" : mine > opponent ? "text-turf" : "text-flag";
  const opponentTone = tied ? "text-stone" : opponent > mine ? "text-turf" : "text-flag";
  const mineBar = tied ? "bg-stone" : mine > opponent ? "bg-turf" : "bg-flag";
  const opponentBar = tied ? "bg-stone" : opponent > mine ? "bg-turf" : "bg-flag";

  return (
    <div className="mono mt-[14px]" aria-label={`Win probability: you ${mine}%, opponent ${opponent}%`}>
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium">
        <span className={mineTone}>YOU {mine}%</span>
        <span className={opponentTone}>OPP {opponent}%</span>
      </div>
      <div className="flex h-1 gap-px bg-ink-line" aria-hidden>
        <i className={`block ${mineBar}`} style={{ width: `${mine}%` }} />
        <i className={`block ${opponentBar}`} style={{ width: `${opponent}%` }} />
      </div>
    </div>
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
      className="group/status relative inline-flex min-h-11 min-w-0 cursor-help items-center py-2"
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

function WeeklySummary({
  mine,
  opponent,
  leftLabel = "YOU",
  rightLabel = "OPP",
}: {
  mine: StarterSummary;
  opponent: StarterSummary | null;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="mb-5 border border-ink-line bg-ink px-3 py-3">
      <p className="mono mb-2 text-[9px] tracking-[0.1em] text-bone">WEEKLY STARTERS</p>
      <div className="mono grid grid-cols-[1fr_42px_42px] gap-2 text-[9px]">
        <span className="text-stone">STATE</span><span className="text-right text-stone">{leftLabel}</span><span className="text-right text-stone">{rightLabel}</span>
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

function HeadToHeadLineups({
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
  const mineBench = mine.lineup?.bench ?? [];
  const opponentBench = opponent?.lineup?.bench ?? [];

  return (
    <section className="mt-5" aria-label="Head-to-head lineups">
      <div className="grid grid-cols-2 gap-2 border-b border-ink-line pb-2">
        <TeamColumnHeader label={leftLabel} side={mine} />
        <TeamColumnHeader label={rightLabel} side={opponent} />
      </div>
      <PairedPlayerGroup label="STARTERS" mine={mineStarters} opponent={opponentStarters} leftLabel={leftLabel} rightLabel={rightLabel} alignSlots />
      <details className="group/bench mt-3 border-t border-ink-line">
        <summary className="mono flex min-h-11 cursor-pointer list-none items-center justify-between text-[9px] tracking-[0.1em] text-stone focus-visible:outline-2 focus-visible:outline-amber">
          <span>BENCH · {leftLabel} {mineBench.length} / {rightLabel} {opponentBench.length}</span>
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

function PairedPlayerGroup({ label, mine, opponent, leftLabel, rightLabel, alignSlots = false }: { label: string; mine: MatchupPlayer[]; opponent: MatchupPlayer[]; leftLabel: string; rightLabel: string; alignSlots?: boolean }) {
  return (
    <div className="mt-3">
      <p className="mono mb-1 text-[9px] tracking-[0.1em] text-stone">{label} · {leftLabel} {mine.length} / {rightLabel} {opponent.length}</p>
      <PairedPlayerRows mine={mine} opponent={opponent} emptyLabel={`No ${label.toLowerCase()} synced.`} alignSlots={alignSlots} />
    </div>
  );
}

function PairedPlayerRows({ mine, opponent, emptyLabel, alignSlots = false }: { mine: MatchupPlayer[]; opponent: MatchupPlayer[]; emptyLabel: string; alignSlots?: boolean }) {
  const mineByOrder = new Map(mine.map((player) => [player.lineupOrder, player]));
  const opponentByOrder = new Map(opponent.map((player) => [player.lineupOrder, player]));
  const length = alignSlots
    ? Math.max(...mineByOrder.keys(), ...opponentByOrder.keys(), -1) + 1
    : Math.max(mine.length, opponent.length);
  if (length === 0) return <p className="border-t border-ink-line py-2 text-xs text-bone-dim">{emptyLabel}</p>;

  return Array.from({ length }, (_, index) => {
    const minePlayer = alignSlots ? mineByOrder.get(index) : mine[index];
    const opponentPlayer = alignSlots ? opponentByOrder.get(index) : opponent[index];
    return (
      <div className="grid grid-cols-2 border-t border-ink-line py-2" key={`${minePlayer?.externalPlayerId ?? "empty"}:${opponentPlayer?.externalPlayerId ?? "empty"}:${index}`}>
        <PlayerCell player={minePlayer} side="left" />
        <PlayerCell player={opponentPlayer} side="right" />
      </div>
    );
  });
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
  return value === null ? "—" : value.toFixed(2);
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
        {card.teamCount ? `${card.teamCount} teams · ` : ""}
        {card.leagueFormat === "chopped"
          ? "Lowest score is eliminated each week. The Chopping Block will appear after the draft."
          : "Matchups and projections will appear after the draft."}
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
