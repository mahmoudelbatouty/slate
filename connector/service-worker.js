"use strict";

const MAX_MATCHUPS = 100;
const DASHBOARD_SCRIPT_ID = "slate-dashboard-bridge";

function normalizedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Dashboard must use HTTP or HTTPS");
  }
  return url.origin;
}

async function registerDashboardBridge(dashboardUrl) {
  const dashboardOrigin = normalizedOrigin(dashboardUrl);
  await chrome.scripting.unregisterContentScripts({ ids: [DASHBOARD_SCRIPT_ID] }).catch(() => undefined);
  await chrome.scripting.registerContentScripts([{
    id: DASHBOARD_SCRIPT_ID,
    matches: [`${dashboardOrigin}/*`],
    js: ["dashboard-bridge.js"],
    runAt: "document_start",
    persistAcrossSessions: true,
  }]);
}

async function claimPairing(message) {
  try {
    const dashboardOrigin = normalizedOrigin(message.dashboardOrigin);
    if (
      message.platform !== "sleeper" ||
      typeof message.challengeId !== "string" ||
      typeof message.claimSecret !== "string" ||
      !message.claimSecret.startsWith("slate_pair_")
    ) {
      throw new Error("Invalid pairing request");
    }

    const response = await fetch(`${dashboardOrigin}/api/connector/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: message.challengeId,
        claimSecret: message.claimSecret,
        platform: message.platform,
        dashboardOrigin,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (
      !response.ok ||
      typeof result.token !== "string" ||
      !result.token.startsWith("slate_") ||
      result.platform !== message.platform ||
      result.dashboardOrigin !== dashboardOrigin
    ) {
      throw new Error(result.error || "Dashboard rejected pairing");
    }

    await chrome.storage.local.set({
      dashboardUrl: dashboardOrigin,
      connectorToken: result.token,
      platform: result.platform,
      installationId: result.installationId,
      lastError: null,
    });
    await chrome.tabs.create({ url: "https://sleeper.com/?login=" });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pairing failed";
    await chrome.storage.local.set({ lastError: message });
    return { ok: false, error: message };
  }
}

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SLATE_PAIR_CLAIM") {
    void claimPairing(message).then(sendResponse);
    return true;
  }

  if (message?.type === "SLATE_REGISTER_DASHBOARD") {
    void registerDashboardBridge(message.dashboardUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Dashboard registration failed",
      }));
    return true;
  }

  if (message?.type === "SLATE_CAPTURE" && message.platform === "sleeper") {
    void deliver(message);
  }
});

async function restoreDashboardBridge() {
  const { dashboardUrl } = await chrome.storage.local.get("dashboardUrl");
  if (dashboardUrl) await registerDashboardBridge(dashboardUrl);
}

chrome.runtime.onInstalled.addListener(() => {
  void restoreDashboardBridge().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void restoreDashboardBridge().catch(() => undefined);
});
