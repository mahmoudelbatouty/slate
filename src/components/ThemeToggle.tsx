"use client";

import { useSyncExternalStore } from "react";

type Theme = "floodlight" | "daybreak";

/**
 * Segmented theme control. The `data-theme` attribute on <html> is the source
 * of truth — it's set before first paint by the boot script in layout.tsx — so
 * this reads the DOM rather than keeping a second copy of the answer in state.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function current(): Theme {
  return document.documentElement.dataset.theme === "daybreak" ? "daybreak" : "floodlight";
}

function apply(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("slate-theme", next);
  } catch {
    // Private mode. The toggle still works for this session.
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "floodlight");

  return (
    <div
      className="flex overflow-hidden rounded-[4px] border border-ink-line"
      role="group"
      aria-label="Theme"
    >
      <Segment label="FLOODLIGHT" active={theme === "floodlight"} onSelect={() => apply("floodlight")} />
      <Segment label="DAYBREAK" active={theme === "daybreak"} onSelect={() => apply("daybreak")} border />
    </div>
  );
}

function Segment({
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
      onClick={onSelect}
      aria-pressed={active}
      className={`mono cursor-pointer px-[9px] py-[6px] text-[calc(9.5px*var(--ui-scale))] tracking-[0.1em] ${border ? "border-l border-ink-line" : ""} ${active ? "bg-bone text-ink" : "text-bone-dim"}`}
    >
      {label}
    </button>
  );
}
