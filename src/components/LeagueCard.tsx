import { deepLink, MONOGRAM, type MatchupCard, type Side } from "@/lib/matchup";

/**
 * Color means game state and nothing else — see DESIGN.md. Platform is
 * the mono monogram in the hairline box, never a brand color.
 */
export function LeagueCard({ card }: { card: MatchupCard }) {
  const link = deepLink(card);
  const mine = card.mine.points ?? 0;
  const theirs = card.opponent?.points ?? 0;
  const diff = mine - theirs;

  // Share of the combined score, so the hairline reads as "who's ahead"
  // rather than pretending to be a win probability we can't compute yet.
  const total = mine + theirs;
  const share = total > 0 ? Math.round((mine / total) * 100) : 50;

  return (
    <article className="border border-ink-line bg-ink-raised px-4 pt-[15px] pb-[13px]">
      <div className="mb-[15px] flex items-center gap-[10px]">
        <span className="mono shrink-0 border border-ink-line px-[6px] py-[3px] text-2xs tracking-[0.05em] text-bone-dim">
          {MONOGRAM[card.platform]}
        </span>
        <span className="display min-w-0 flex-1 truncate text-sm font-bold">
          {card.leagueName}
        </span>
        <StateLabel isFinal={card.isFinal} hasScore={total > 0} />
      </div>

      <Row side={card.mine} isMine diff={diff} isFinal={card.isFinal} />

      <div className="relative my-[14px] h-[2px] bg-ink-line">
        <i
          className={`absolute inset-y-0 left-0 block ${diff < 0 ? "bg-flag" : "bg-turf"}`}
          style={{ width: `${share}%` }}
        />
        <u className="absolute top-[-3px] left-1/2 h-2 w-px bg-bone-dim opacity-70" />
      </div>

      <Row side={card.opponent} isMine={false} diff={0} isFinal={card.isFinal} />

      <div className="mt-[14px] flex items-center justify-between border-t border-ink-line pt-[11px] text-2xs text-bone-dim">
        <span className="mono">{marginLabel(diff, card.isFinal, total)}</span>
        <a
          className="border-b border-ink-line pb-[2px] text-2xs text-bone"
          href={link.href}
          target="_blank"
          rel="noreferrer"
        >
          {link.label} ↗
        </a>
      </div>
    </article>
  );
}

function StateLabel({ isFinal, hasScore }: { isFinal: boolean; hasScore: boolean }) {
  if (isFinal) {
    return <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">FINAL</span>;
  }
  if (!hasScore) {
    // Pre-kickoff. Amber is rationed for things actually happening.
    return <span className="mono text-[10px] tracking-[0.14em] text-bone-dim">PREGAME</span>;
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
