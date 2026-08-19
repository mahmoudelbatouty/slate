import type { NflGameBox } from "@/lib/nfl-scoreboard";
import { scoreboardSummary } from "@/lib/nfl-scoreboard";

/**
 * The real NFL games behind the fantasy week. Server-rendered: it is a plain
 * read of rows the sync job already stores for starter state.
 */
export function AroundTheLeague({ games, week }: { games: NflGameBox[]; week: number | null }) {
  if (games.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-[10px] border-b border-ink-line px-[18px] pt-[14px] pb-[15px]"
      aria-label={week ? `NFL games, week ${week}` : "NFL games"}
    >
      <div className="mono flex items-baseline justify-between gap-[10px] text-[9.5px] text-stone">
        <span className="tracking-[0.13em]">AROUND THE LEAGUE</span>
        <span className="tracking-[0.1em]">{scoreboardSummary(games)}</span>
      </div>
      <div className="rail-hidden flex gap-2 overflow-x-auto pb-[2px]">
        {games.map((game) => (
          <GameBox key={game.gameId} game={game} />
        ))}
      </div>
    </section>
  );
}

function GameBox({ game }: { game: NflGameBox }) {
  const pre = game.phase === "upcoming";

  return (
    <article className="flex w-[118px] shrink-0 flex-col gap-2 rounded-[5px] border border-ink-line bg-ink-raised px-[11px] py-[10px]">
      <TeamRow
        team={game.away}
        points={game.awayPoints}
        leading={!pre && game.leader !== "home"}
        pre={pre}
      />
      <TeamRow
        team={game.home}
        points={game.homePoints}
        leading={!pre && game.leader !== "away"}
        pre={pre}
      />
      <span
        className={`mono border-t border-ink-line pt-[7px] text-[9px] tracking-[0.1em] ${game.phase === "live" ? "text-amber" : "text-stone"}`}
      >
        {game.status}
      </span>
    </article>
  );
}

function TeamRow({
  team,
  points,
  leading,
  pre,
}: {
  team: string;
  points: number | null;
  leading: boolean;
  pre: boolean;
}) {
  const tone = pre || !leading ? "text-bone-dim" : "text-bone";
  return (
    <div className={`mono flex items-center justify-between gap-2 ${tone}`}>
      <span className="text-[11px] tracking-[0.07em]">{team}</span>
      <span className="text-[14px] font-medium tabular-nums">{points ?? "—"}</span>
    </div>
  );
}
