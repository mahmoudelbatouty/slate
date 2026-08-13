"use strict";

const MAX_MATCHUPS = 100;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeMatchup(row) {
  if (!row || typeof row !== "object") return null;
  if (typeof row.league_id !== "string" || !finiteNumber(row.round)) return null;
  if (!finiteNumber(row.roster_id)) return null;

  const clean = {
    league_id: row.league_id,
    round: Math.trunc(row.round),
    roster_id: Math.trunc(row.roster_id),
    proj_points: finiteNumber(row.proj_points) ? row.proj_points : null,
  };
  if (finiteNumber(row.matchup_id)) clean.matchup_id = Math.trunc(row.matchup_id);
  if (finiteNumber(row.points)) clean.points = row.points;
  if (Array.isArray(row.starters)) {
    clean.starters = row.starters.filter((value) => typeof value === "string").slice(0, 30);
  }
  if (row.player_map && typeof row.player_map === "object" && !Array.isArray(row.player_map)) {
    clean.player_map = Object.fromEntries(
      Object.entries(row.player_map)
        .filter(([key, value]) => typeof key === "string" && finiteNumber(value))
        .slice(0, 100)
    );
  }
  return clean;
}

async function deliver(message) {
  const config = await chrome.storage.local.get(["dashboardUrl", "connectorToken"]);
  if (!config.dashboardUrl || !config.connectorToken) {
    await chrome.storage.local.set({ lastError: "Connector is not paired" });
    return;
  }

  const matchups = message.matchups
    .slice(0, MAX_MATCHUPS)
    .map(sanitizeMatchup)
    .filter(Boolean);
  if (matchups.length === 0) return;

  try {
    const response = await fetch(`${config.dashboardUrl}/api/connector/ingest`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.connectorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        platform: "sleeper",
        kind: "matchup_legs",
        capturedAt: message.capturedAt,
        matchups,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Dashboard returned ${response.status}`);
    await chrome.storage.local.set({
      lastCaptureAt: new Date().toISOString(),
      lastUpdated: result.updated ?? 0,
      lastError: null,
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastError: error instanceof Error ? error.message : "Capture failed",
    });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SLATE_CAPTURE" && message.platform === "sleeper") {
    void deliver(message);
  }
});
