import { PlatformMark } from "@/components/PlatformMark";
import { SlateMark } from "@/components/SlateMark";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The signed-out left panel. The board below the headline is an illustration of
 * the product, labelled as one — a signed-out visitor has no scores to show.
 */
const SAMPLE = [
  { league: "Sunday Syndicate", score: "112.4 — 98.7", tone: "text-turf" },
  { league: "Third & Long", score: "88.1 — 91.6", tone: "text-flag" },
  { league: "The Waiver Wire", score: "104.9 — 104.2", tone: "text-turf" },
  { league: "Bye Week Blues", score: "76.3 — 80.0", tone: "text-stone" },
];

export function SignInBoard() {
  return (
    <section className="flex flex-col justify-center gap-8 border-ink-line px-[18px] py-12 max-signin:border-b signin:px-12">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-[10px]">
          <SlateMark size={24} />
          <span className="display text-[15px]">Slate</span>
        </span>
        <ThemeToggle />
      </div>

      <div className="flex max-w-[600px] flex-col gap-[18px]">
        <h1 className="display text-[clamp(36px,3.6vw,52px)] leading-none tracking-[-0.028em]">
          One screen for every league you&apos;re in.
        </h1>
        <p className="max-w-[520px] text-[16.5px] leading-relaxed text-bone-dim">
          Slate pulls your Sleeper, ESPN, and Yahoo leagues into a single live board — every matchup,
          every remaining starter, ordered by which game is actually close.
        </p>
      </div>

      <div className="max-w-[600px] overflow-hidden rounded-[6px] border border-ink-line bg-ink-raised">
        <div className="mono flex items-center justify-between border-b border-ink-line bg-deep px-[15px] py-[11px] text-[10.5px] tracking-[0.13em] text-stone">
          <span>SAMPLE BOARD · WHAT SUNDAY LOOKS LIKE</span>
          <span className="flex items-center gap-[6px] text-amber">
            <i className="pulse h-[5px] w-[5px] rounded-full bg-amber" aria-hidden />
            LIVE
          </span>
        </div>
        {SAMPLE.map((row) => (
          <div
            className="flex items-center justify-between gap-4 border-b border-ink-line px-[15px] py-[13px] last:border-b-0"
            key={row.league}
          >
            <span className="text-[13px] text-bone">{row.league}</span>
            <span className={`display text-base tabular-nums ${row.tone}`}>{row.score}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="mono text-[10.5px] tracking-[0.13em] text-stone">SYNCS</span>
        <span className="flex items-center gap-[14px]">
          <PlatformMark platform="sleeper" variant="mark" size={18} />
          <PlatformMark platform="espn" variant="mark" size={18} />
          <PlatformMark platform="yahoo" variant="mark" size={18} />
        </span>
      </div>
    </section>
  );
}
