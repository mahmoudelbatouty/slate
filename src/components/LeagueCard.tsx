import Image from "next/image";
import { deepLink, MONOGRAM, type MatchupCard, type Side } from "@/lib/matchup";
import type { StarterSummary } from "@/lib/game-state";

/**
 * Color means game state and nothing else — see DESIGN.md. Platform identity
 * stays neutral: an official monochrome mark where available, otherwise the
 * compact monogram fallback.
 */
export function LeagueCard({ card }: { card: MatchupCard }) {
  const link = deepLink(card);
  const mine = card.mine.points ?? 0;
  const theirs = card.opponent?.points ?? 0;
  const diff = mine - theirs;

  const total = mine + theirs;
  const share = card.winProbability ?? (total > 0 ? Math.round((mine / total) * 100) : 50);

  return (
    <article className="group/card border border-ink-line bg-ink-raised px-4 pt-[15px] pb-[13px]">
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
        <PreDraft card={card} link={link} />
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
            <a
              className="ml-auto border-b border-ink-line pb-[2px] text-2xs text-bone"
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label} ↗
            </a>
          </div>
        </>
      )}
    </article>
  );
}

function PlatformMark({ platform }: { platform: MatchupCard["platform"] }) {
  if (platform === "sleeper") {
    return (
      <span className="flex h-[24px] w-[58px] shrink-0 items-center border border-ink-line px-[5px]">
        <Image
          src="https://sleepercdn.com/landing/web2026/img/logos/logo-full-horizontal-white.png"
          alt="Sleeper"
          width={94}
          height={24}
          className="platform-mark-image h-auto w-full"
        />
      </span>
    );
  }

  return (
    <span className="mono shrink-0 border border-ink-line px-[6px] py-[3px] text-2xs tracking-[0.05em] text-bone-dim">
      {MONOGRAM[platform]}
    </span>
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

function PreDraft({
  card,
  link,
}: {
  card: MatchupCard;
  link: ReturnType<typeof deepLink>;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-bone">Draft not started</p>
      <p className="mt-1 text-xs text-bone-dim">
        {card.teamCount ? `${card.teamCount} teams · ` : ""}Matchups and projections will appear after the draft.
      </p>
      <div className="mt-[14px] flex items-center justify-between border-t border-ink-line pt-[11px] text-2xs text-bone-dim">
        <span className="mono">{card.mine.teamId ? card.mine.name : "ROSTER PENDING"}</span>
        <a
          className="border-b border-ink-line pb-[2px] text-2xs text-bone"
          href={link.href}
          target="_blank"
          rel="noreferrer"
        >
          {link.label} ↗
        </a>
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
