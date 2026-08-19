/**
 * The four-square Slate mark. One lit square, three inert — the same shape the
 * empty state blows up to 44px with every square dark.
 */
export function SlateMark({ size = 17, lit = true }: { size?: number; lit?: boolean }) {
  const radius = size > 30 ? 10 : 4;
  const pad = size > 30 ? 9 : 3;
  const gap = size > 30 ? 4 : 2;

  return (
    <span
      aria-hidden
      className="grid shrink-0 grid-cols-2 grid-rows-2 border border-ink-line bg-ink-raised"
      style={{ width: size, height: size, borderRadius: radius, padding: pad, gap }}
    >
      <i className={`rounded-[1px] ${lit ? "bg-amber" : "bg-mark-off"}`} />
      <i className="rounded-[1px] bg-mark-off" />
      <i className="rounded-[1px] bg-mark-off" />
      <i className="rounded-[1px] bg-mark-off" />
    </span>
  );
}
