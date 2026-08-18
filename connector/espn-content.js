(() => {
  "use strict";

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("espn-page-bridge.js");
  script.onload = () => {
    script.remove();
    scheduleDiscovery();
  };
  (document.head || document.documentElement).appendChild(script);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.type !== "SLATE_FANTASY_CAPTURE" ||
      message.source !== "espn" ||
      !message.snapshot
    ) return;

    chrome.runtime.sendMessage({
      type: "SLATE_CAPTURE",
      platform: "espn",
      capturedAt: message.capturedAt,
      snapshots: [message.snapshot],
    });
  });

  let lastDiscovery = "";
  let discoveryTimer = null;

  function discoverLeagueLinks() {
    const leagues = new Map();

    for (const anchor of document.querySelectorAll("a[href]")) {
      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        continue;
      }

      if (url.hostname !== "espn.com" && !url.hostname.endsWith(".espn.com")) continue;
      const leagueId = url.searchParams.get("leagueId");
      if (!leagueId || !/^\d+$/.test(leagueId)) continue;

      const seasonParam = url.searchParams.get("seasonId");
      const season = seasonParam && /^\d{4}$/.test(seasonParam)
        ? Number(seasonParam)
        : new Date().getFullYear();
      if (season < 2000 || season > 2100) continue;

      const teamParam = url.searchParams.get("teamId");
      const teamId = teamParam && /^\d+$/.test(teamParam) ? teamParam : null;
      const existing = leagues.get(leagueId);
      if (!existing && leagues.size >= 10) continue;
      if (!existing || (!existing.teamId && teamId)) {
        leagues.set(leagueId, { leagueId, season, teamId });
      }
    }

    const discovered = [...leagues.values()];
    const signature = JSON.stringify(discovered);
    if (!discovered.length || signature === lastDiscovery) return;
    lastDiscovery = signature;
    window.postMessage({ type: "SLATE_ESPN_DISCOVER", leagues: discovered }, window.location.origin);
  }

  function scheduleDiscovery() {
    if (discoveryTimer !== null) window.clearTimeout(discoveryTimer);
    discoveryTimer = window.setTimeout(discoverLeagueLinks, 250);
  }

  const observer = new MutationObserver(scheduleDiscovery);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", scheduleDiscovery, { once: true });
  scheduleDiscovery();
})();
