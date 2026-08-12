"use client";

import { useSyncExternalStore } from "react";

type Theme = "floodlight" | "daybreak";

/**
 * The one interactive client component on the dashboard. Everything else
 * is a Server Component reading Postgres.
 *
 * The `data-theme` attribute on <html> is the source of truth — it's set
 * before first paint by the boot script in layout.tsx — so this reads the
 * DOM rather than keeping a second copy of the answer in React state.
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
  return document.documentElement.dataset.theme === "daybreak"
    ? "daybreak"
    : "floodlight";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "floodlight");

  function toggle() {
    const next: Theme = theme === "floodlight" ? "daybreak" : "floodlight";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("slate-theme", next);
    } catch {
      // Private mode. The toggle still works for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="mono cursor-pointer border border-ink-line px-2 py-1 text-[10px] tracking-[0.06em] text-bone-dim"
    >
      {theme === "floodlight" ? "DAYBREAK" : "FLOODLIGHT"}
    </button>
  );
}
