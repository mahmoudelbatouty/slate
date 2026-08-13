import type { DotState, LeftToPlay as LeftToPlayModel } from "@/lib/game-state";

export function LeftToPlay({ spine }: { spine: LeftToPlayModel }) {
  return (
    <section className="mt-[18px] border-y border-ink-line py-[14px]" aria-labelledby="left-to-play">
      <div className="mb-[11px] flex items-baseline justify-between gap-3">
        <h2 id="left-to-play" className="display text-xs">Left to play</h2>
        <p className="mono text-2xs text-bone-dim">
          {spine.remaining} of {spine.total} remaining
        </p>
      </div>

      {spine.windows.length ? (
        <div className="flex min-w-0 overflow-x-auto border border-ink-line">
          {spine.windows.map((window) => (
            <div key={window.startTime} className="min-w-[92px] flex-1 border-r border-ink-line px-3 py-[10px] last:border-r-0">
              <div className="mono mb-2 text-center text-2xs text-bone-dim">{window.label}</div>
              <div className="flex flex-wrap gap-[6px]">
                {window.dots.map((state, index) => <Dot key={index} state={state} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border border-ink-line px-3 py-4 text-sm text-bone-dim">No NFL game windows today.</p>
      )}

      <div className="mono mt-[10px] flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-bone-dim">
        <Legend state="played" label={`${spine.played} played`} />
        <Legend state="live" label={`${spine.live} live`} />
        <Legend state="upcoming" label={`${spine.remaining} yet to play`} />
        {spine.unassigned > 0 ? <span>{spine.unassigned} bye or unmatched</span> : null}
      </div>
    </section>
  );
}

function Dot({ state }: { state: DotState }) {
  const className = state === "played"
    ? "bg-stone"
    : state === "live"
      ? "pulse bg-amber"
      : "border border-bone bg-transparent";
  return <span className={`block h-[7px] w-[7px] rounded-full ${className}`} role="img" aria-label={state} />;
}

function Legend({ state, label }: { state: DotState; label: string }) {
  return <span className="flex items-center gap-[5px]"><Dot state={state} />{label}</span>;
}
