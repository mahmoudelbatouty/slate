"use strict";

importScripts("espn-background.js");

const MAX_MATCHUPS = 100;
const DASHBOARD_SCRIPT_ID = "slate-dashboard-bridge";
const ESPN_REFRESH_ALARM = "slate-espn-refresh";
const ESPN_IDLE_REFRESH_MS = 5 * 60_000;
const ESPN_LIVE_REFRESH_MS = 60_000;
let espnRefreshInFlight = null;

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
      !["sleeper", "espn"].includes(message.platform) ||
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

    const stored = await chrome.storage.local.get("connections");
    const connections = stored.connections && typeof stored.connections === "object"
      ? stored.connections
      : {};
    connections[result.platform] = {
      dashboardUrl: dashboardOrigin,
      connectorToken: result.token,
      installationId: result.installationId,
    };
    const updates = {
      connections,
      dashboardUrl: dashboardOrigin,
      lastError: null,
    };
    if (result.platform === "espn") updates.espnLeagues = [];
    await chrome.storage.local.set(updates);
    await chrome.tabs.create({
      url: result.platform === "espn"
        ? "https://fantasy.espn.com/football/welcome"
        : "https://sleeper.com/?login=",
    });
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

function safeString(value, max = 160) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function nullableNumber(value) {
  return finiteNumber(value) ? value : null;
}

function sanitizeEspnPlayer(player) {
  if (!player || typeof player !== "object" || typeof player.id !== "string" || typeof player.name !== "string") return null;
  return {
    id: player.id,
    name: player.name.slice(0, 160),
    position: safeString(player.position, 16),
    proTeam: safeString(player.proTeam, 16),
    lineupSlot: safeString(player.lineupSlot, 24) ?? "BN",
    injuryStatus: safeString(player.injuryStatus, 32),
    currentPoints: nullableNumber(player.currentPoints),
    projectedPoints: nullableNumber(player.projectedPoints),
  };
}

function sanitizeEspnTeam(team) {
  if (!team || typeof team !== "object" || typeof team.id !== "string" || !/^\d+$/.test(team.id) || typeof team.name !== "string") return null;
  return {
    id: team.id,
    name: team.name.slice(0, 160),
    abbreviation: safeString(team.abbreviation, 16),
    managerName: safeString(team.managerName, 160),
    wins: Math.max(0, Math.trunc(team.wins ?? 0)),
    losses: Math.max(0, Math.trunc(team.losses ?? 0)),
    ties: Math.max(0, Math.trunc(team.ties ?? 0)),
    pointsFor: nullableNumber(team.pointsFor),
    pointsAgainst: nullableNumber(team.pointsAgainst),
    standing: Number.isInteger(team.standing) && team.standing > 0 ? team.standing : null,
    roster: Array.isArray(team.roster) ? team.roster.slice(0, 100).map(sanitizeEspnPlayer).filter(Boolean) : [],
  };
}

function sanitizeEspnMatchup(game) {
  if (!game || typeof game !== "object" || typeof game.id !== "string" || !Number.isInteger(game.week)) return null;
  return {
    id: game.id,
    week: game.week,
    isFinal: game.isFinal === true,
    homeTeamId: typeof game.homeTeamId === "string" && /^\d+$/.test(game.homeTeamId) ? game.homeTeamId : null,
    awayTeamId: typeof game.awayTeamId === "string" && /^\d+$/.test(game.awayTeamId) ? game.awayTeamId : null,
    homePoints: nullableNumber(game.homePoints),
    awayPoints: nullableNumber(game.awayPoints),
    homeProjected: nullableNumber(game.homeProjected),
    awayProjected: nullableNumber(game.awayProjected),
  };
}

function sanitizeEspnSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || typeof snapshot.leagueId !== "string" || !/^\d+$/.test(snapshot.leagueId)) return null;
  if (!Number.isInteger(snapshot.season) || !Number.isInteger(snapshot.currentWeek)) return null;
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams.slice(0, 32).map(sanitizeEspnTeam).filter(Boolean) : [];
  if (teams.length === 0) return null;
  return {
    leagueId: snapshot.leagueId,
    season: snapshot.season,
    name: safeString(snapshot.name, 200) ?? `ESPN League ${snapshot.leagueId}`,
    teamCount: Math.min(32, Math.max(1, Math.trunc(snapshot.teamCount ?? teams.length))),
    currentWeek: snapshot.currentWeek,
    status: ["pre_draft", "in_season", "complete"].includes(snapshot.status) ? snapshot.status : "in_season",
    myTeamId: typeof snapshot.myTeamId === "string" && /^\d+$/.test(snapshot.myTeamId) ? snapshot.myTeamId : null,
    rosterSlots: Object.fromEntries(Object.entries(snapshot.rosterSlots ?? {}).filter(([key, value]) => typeof key === "string" && Number.isInteger(value) && value >= 0 && value <= 30)),
    teams,
    matchups: Array.isArray(snapshot.matchups) ? snapshot.matchups.slice(0, 500).map(sanitizeEspnMatchup).filter(Boolean) : [],
  };
}

function espnLeagueRef(value) {
  return self.SlateEspnBackground.normalizeLeagueRef(value);
}

async function rememberEspnLeagues(values) {
  const incoming = (Array.isArray(values) ? values : [])
    .slice(0, 10)
    .map(espnLeagueRef)
    .filter(Boolean);
  if (!incoming.length) return;

  const { espnLeagues } = await chrome.storage.local.get("espnLeagues");
  const byLeague = new Map(
    (Array.isArray(espnLeagues) ? espnLeagues : [])
      .map(espnLeagueRef)
      .filter(Boolean)
      .map((league) => [`${league.season}:${league.leagueId}`, league])
  );
  for (const league of incoming) {
    const key = `${league.season}:${league.leagueId}`;
    const previous = byLeague.get(key);
    byLeague.set(key, previous?.teamId && !league.teamId ? previous : league);
  }
  await chrome.storage.local.set({ espnLeagues: [...byLeague.values()].slice(-10) });
  await ensureEspnAlarm(ESPN_IDLE_REFRESH_MS);
}

async function scheduleEspnRefresh(delayMs) {
  const safeDelay = Math.max(ESPN_LIVE_REFRESH_MS, Math.min(ESPN_IDLE_REFRESH_MS, delayMs));
  await chrome.alarms.create(ESPN_REFRESH_ALARM, { delayInMinutes: safeDelay / 60_000 });
}

async function ensureEspnAlarm(delayMs = ESPN_LIVE_REFRESH_MS) {
  const stored = await chrome.storage.local.get(["connections", "espnLeagues"]);
  if (!stored.connections?.espn || !Array.isArray(stored.espnLeagues) || stored.espnLeagues.length === 0) return;
  const existing = await chrome.alarms.get(ESPN_REFRESH_ALARM);
  if (!existing) await scheduleEspnRefresh(delayMs);
}

async function refreshEspnLeagues() {
  const stored = await chrome.storage.local.get(["connections", "espnLeagues"]);
  if (!stored.connections?.espn) return;
  const leagues = (Array.isArray(stored.espnLeagues) ? stored.espnLeagues : [])
    .slice(0, 10)
    .map(espnLeagueRef)
    .filter(Boolean);
  if (!leagues.length) return;

  let refreshed = 0;
  let nextRefreshMs = ESPN_IDLE_REFRESH_MS;
  const capturedAt = new Date().toISOString();
  for (const league of leagues) {
    const url = self.SlateEspnBackground.buildLeagueUrl(league);
    if (!url) continue;
    try {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!response.ok) continue;
      const snapshot = self.SlateEspnBackground.sanitizeResponse(await response.json(), league);
      if (!snapshot) continue;
      const result = await deliver({
        platform: "espn",
        capturedAt,
        snapshots: [snapshot],
      }, false);
      if (result.ok) {
        refreshed++;
        if (result.nextRefreshMs === ESPN_LIVE_REFRESH_MS) nextRefreshMs = ESPN_LIVE_REFRESH_MS;
      }
    } catch {
      // A signed-out or temporarily unavailable ESPN session retries later.
    }
  }

  if (!refreshed) {
    await chrome.storage.local.set({ lastError: "ESPN background refresh could not read any leagues" });
    await scheduleEspnRefresh(ESPN_IDLE_REFRESH_MS);
  } else {
    await scheduleEspnRefresh(nextRefreshMs);
  }
}

async function deliver(message, scheduleRefresh = true) {
  const stored = await chrome.storage.local.get(["connections", "dashboardUrl", "connectorToken"]);
  const config = stored.connections?.[message.platform] ?? {
    dashboardUrl: stored.dashboardUrl,
    connectorToken: stored.connectorToken,
  };
  if (!config?.dashboardUrl || !config?.connectorToken) {
    await chrome.storage.local.set({ lastError: "Connector is not paired" });
    return { ok: false };
  }

  const payload = message.platform === "espn"
    ? {
        version: 1,
        platform: "espn",
        kind: "league_snapshot",
        capturedAt: message.capturedAt,
        snapshots: (message.snapshots ?? []).slice(0, 10).map(sanitizeEspnSnapshot).filter(Boolean),
      }
    : {
        version: 1,
        platform: "sleeper",
        kind: "matchup_legs",
        capturedAt: message.capturedAt,
        matchups: (message.matchups ?? []).slice(0, MAX_MATCHUPS).map(sanitizeMatchup).filter(Boolean),
      };
  if ((payload.snapshots ?? payload.matchups).length === 0) return { ok: false };

  try {
    const response = await fetch(`${config.dashboardUrl}/api/connector/ingest`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.connectorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Dashboard returned ${response.status}`);
    await chrome.storage.local.set({
      lastCaptureAt: new Date().toISOString(),
      lastUpdated: result.updated ?? 0,
      lastError: null,
    });
    if (message.platform === "espn" && scheduleRefresh) {
      await scheduleEspnRefresh(
        result.nextRefreshMs === ESPN_LIVE_REFRESH_MS
          ? ESPN_LIVE_REFRESH_MS
          : ESPN_IDLE_REFRESH_MS
      );
    }
    return { ok: true, nextRefreshMs: result.nextRefreshMs };
  } catch (error) {
    await chrome.storage.local.set({
      lastError: error instanceof Error ? error.message : "Capture failed",
    });
    if (message.platform === "espn" && scheduleRefresh) await scheduleEspnRefresh(ESPN_IDLE_REFRESH_MS);
    return { ok: false };
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

  if (message?.type === "SLATE_ESPN_DISCOVER") {
    void rememberEspnLeagues(message.leagues).catch(() => undefined);
    return;
  }

  if (message?.type === "SLATE_CAPTURE" && ["sleeper", "espn"].includes(message.platform)) {
    if (message.platform === "espn") {
      const leagueRefs = (message.snapshots ?? []).map((snapshot) => ({
        leagueId: snapshot?.leagueId,
        season: snapshot?.season,
        teamId: snapshot?.myTeamId,
      }));
      void rememberEspnLeagues(leagueRefs)
        .then(() => deliver(message))
        .catch(() => undefined);
    } else {
      void deliver(message);
    }
  }
});

async function restoreDashboardBridge() {
  const { dashboardUrl } = await chrome.storage.local.get("dashboardUrl");
  if (dashboardUrl) await registerDashboardBridge(dashboardUrl);
}

chrome.runtime.onInstalled.addListener(() => {
  void restoreDashboardBridge().catch(() => undefined);
  void ensureEspnAlarm().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void restoreDashboardBridge().catch(() => undefined);
  void ensureEspnAlarm().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ESPN_REFRESH_ALARM || espnRefreshInFlight) return;
  espnRefreshInFlight = refreshEspnLeagues()
    .catch(() => scheduleEspnRefresh(ESPN_IDLE_REFRESH_MS).catch(() => undefined))
    .finally(() => {
      espnRefreshInFlight = null;
    });
});
