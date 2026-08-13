/**
 * Adapter tests run entirely against fixtures/sleeper/, recorded once by
 * scripts/record-fixtures.ts. No test hits a live API — that's what keeps
 * them fast and keeps a Sunday outage from turning the suite red.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearProjectionCache,
  getProjections,
  projectPlayer,
  projectTeam,
  sleeperAdapter,
  uniqueSleeperPlayerIds,
} from "./sleeper";
import type { Credentials } from "./types";

const DIR = join(process.cwd(), "fixtures", "sleeper");

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));

const meta = fixture("meta") as {
  leagueId: string;
  season: number;
  week: number;
  userId: string;
};

const creds: Credentials = { platform: "sleeper", username: "mahmoudtariq" };

/** Synthetic projections — small, and enough to prove the sum works. */
const PROJECTIONS = [
  { player_id: "p1", stats: { pass_yd: 250, pass_td: 2, pass_int: 1, rush_yd: 20 } },
  { player_id: "p2", stats: { rec: 5, rec_yd: 80, rec_td: 0.5 } },
];

let projectionStatus = 200;

beforeEach(() => {
  projectionStatus = 200;
  clearProjectionCache();

  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    const ok = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    if (url.includes("/projections/")) {
      return projectionStatus === 200
        ? ok(PROJECTIONS)
        : new Response("nope", { status: projectionStatus });
    }
    if (url.endsWith("/state/nfl")) return ok(fixture("state"));
    if (url.includes("/leagues/nfl/")) return ok(fixture("leagues"));
    if (url.includes("/matchups/")) return ok(fixture("matchups"));
    if (url.includes("/transactions/")) return ok(fixture("transactions"));
    if (url.endsWith("/rosters")) return ok(fixture("rosters"));
    if (url.endsWith("/users")) return ok(fixture("users"));
    if (url.includes("/user/")) return ok(fixture("user"));
    if (url.includes("/league/")) return ok(fixture("league"));

    throw new Error(`unstubbed fetch: ${url}`);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("healthCheck", () => {
  it("is true when the user resolves", async () => {
    expect(await sleeperAdapter.healthCheck(creds)).toBe(true);
  });

  it("is false rather than throwing when Sleeper is down", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
    expect(await sleeperAdapter.healthCheck(creds)).toBe(false);
  });

  it("rejects credentials belonging to another platform", async () => {
    await expect(
      sleeperAdapter.healthCheck({ platform: "espn", espnS2: "x", swid: "y" })
    ).resolves.toBe(false);
  });
});

describe("listLeagues", () => {
  it("returns canonical leagues with no platform shapes leaking", async () => {
    const leagues = await sleeperAdapter.listLeagues(creds, "nfl", meta.season);

    expect(leagues.length).toBeGreaterThan(0);
    for (const league of leagues) {
      expect(league.externalId).toMatch(/^\d+$/);
      expect(league.sport).toBe("nfl");
      expect(league.season).toBe(meta.season);
      expect(["ppr", "half_ppr", "standard", "custom"]).toContain(league.scoringType);
      expect(["pre_draft", "in_season", "complete"]).toContain(league.status);
      expect(typeof league.teamCount).toBe("number");
      // Not a Sleeper field name in sight.
      expect(league).not.toHaveProperty("league_id");
      expect(league).not.toHaveProperty("total_rosters");
    }
  });

  it("keeps the ordered roster_positions in the raw blob", async () => {
    // rosterSlots is a count map and loses order; sync/slots.ts needs the
    // order to resolve S0/S1/... into QB/RB/WR.
    const [league] = await sleeperAdapter.listLeagues(creds, "nfl", meta.season);
    const raw = league.scoringRaw as { roster_positions?: unknown };

    expect(Array.isArray(raw.roster_positions)).toBe(true);
    expect((raw.roster_positions as string[]).length).toBeGreaterThan(0);
  });
});

describe("getTeams", () => {
  it("ranks standings by wins then points for", async () => {
    const teams = await sleeperAdapter.getTeams(creds, meta.leagueId, meta.season);

    const standings = teams.map((t) => t.standing).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(standings).toEqual(teams.map((_, i) => i + 1));

    const ranked = [...teams].sort((a, b) => (a.standing ?? 0) - (b.standing ?? 0));
    for (let i = 1; i < ranked.length; i++) {
      const prev = ranked[i - 1];
      const curr = ranked[i];
      const better =
        prev.record.wins > curr.record.wins ||
        (prev.record.wins === curr.record.wins && prev.pointsFor >= curr.pointsFor);
      expect(better).toBe(true);
    }
  });

  it("marks exactly one team as mine", async () => {
    const teams = await sleeperAdapter.getTeams(creds, meta.leagueId, meta.season);
    expect(teams.filter((t) => t.isMine)).toHaveLength(1);
  });
});

describe("getRosters", () => {
  it("drops repeated preseason empty-slot placeholders", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify([
          {
            roster_id: 1,
            owner_id: "owner",
            players: ["p1", "0", "0", "p2", "p2"],
            starters: ["p1", "0", "0"],
            settings: null,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const entries = await sleeperAdapter.getRosters(creds, "league", 2026, 1);
    expect(entries.map((entry) => entry.externalPlayerId)).toEqual(["p1", "p2"]);
    expect(entries[0].slot).toBe("S0");
  });

  it("emits positional placeholders for starters and BN for the bench", async () => {
    const entries = await sleeperAdapter.getRosters(
      creds,
      meta.leagueId,
      meta.season,
      meta.week
    );

    const starters = entries.filter((e) => e.isStarter);
    const bench = entries.filter((e) => !e.isStarter);

    expect(starters.length).toBeGreaterThan(0);
    for (const entry of starters) expect(entry.slot).toMatch(/^S\d+$/);
    for (const entry of bench) expect(entry.slot).toBe("BN");
  });

  it("never lists a player as both starter and bench", async () => {
    const entries = await sleeperAdapter.getRosters(
      creds,
      meta.leagueId,
      meta.season,
      meta.week
    );

    const byTeam = new Map<string, Set<string>>();
    for (const entry of entries) {
      const seen = byTeam.get(entry.teamExternalId) ?? new Set();
      expect(seen.has(entry.externalPlayerId)).toBe(false);
      seen.add(entry.externalPlayerId);
      byTeam.set(entry.teamExternalId, seen);
    }
  });
});

describe("uniqueSleeperPlayerIds", () => {
  it("removes empty slots and duplicate starters", () => {
    expect(uniqueSleeperPlayerIds(["p1", "0", "p1", "", "p2"])).toEqual(["p1", "p2"]);
  });
});

describe("getMatchups", () => {
  it("pairs both sides of every game", async () => {
    const matchups = await sleeperAdapter.getMatchups(
      creds,
      meta.leagueId,
      meta.season,
      meta.week
    );

    expect(matchups.length).toBeGreaterThan(0);

    const byTeam = new Map(matchups.map((m) => [m.teamExternalId, m]));
    for (const row of matchups) {
      expect(row.week).toBe(meta.week);
      if (!row.opponentExternalId) continue;

      // The opponent's row must point back at this team.
      const mirror = byTeam.get(row.opponentExternalId);
      expect(mirror?.opponentExternalId).toBe(row.teamExternalId);
      expect(mirror?.matchupKey).toBe(row.matchupKey);
    }
  });

  it("leaves isFinal to the sync job", async () => {
    const matchups = await sleeperAdapter.getMatchups(
      creds,
      meta.leagueId,
      meta.season,
      meta.week
    );
    expect(matchups.every((m) => m.isFinal === false)).toBe(true);
  });
});

describe("projections", () => {
  it("keeps Sleeper's raw projected stat line for league scoring", async () => {
    const proj = await getProjections(meta.season, meta.week);
    expect(proj.get("p1")).toEqual({ pass_yd: 250, pass_td: 2, pass_int: 1, rush_yd: 20 });
  });

  it("degrades to an empty map instead of throwing", async () => {
    projectionStatus = 503;
    const proj = await getProjections(meta.season, meta.week);
    expect(proj.size).toBe(0);
  });

  it("does not cache a failure", async () => {
    projectionStatus = 503;
    expect((await getProjections(meta.season, meta.week)).size).toBe(0);

    projectionStatus = 200;
    expect((await getProjections(meta.season, meta.week)).size).toBe(2);
  });

  it("calls the host once for repeated weeks", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify(PROJECTIONS), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", spy);

    await getProjections(meta.season, meta.week);
    await getProjections(meta.season, meta.week);
    await getProjections(meta.season, meta.week);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("applies every league scoring category and sums unrounded starters", () => {
    const proj = new Map<string, Record<string, number>>([
      ["p1", { pass_yd: 245.34, pass_td: 1.6, pass_int: 0.78, rush_yd: 17.15 }],
      ["p2", { rec: 5.25, rec_yd: 80, rec_td: 0.5 }],
    ]);
    const scoring = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rec: 0.5, rec_yd: 0.1, rec_td: 6 };

    expect(projectPlayer(proj.get("p1"), scoring)).toBeCloseTo(16.3686, 4);
    expect(projectTeam(["p1", "p2"], proj, scoring)).toBe(29.99);
    expect(projectTeam(["p1", "unknown"], proj, scoring)).toBe(16.37);
    // An empty projection map means "no data", not "zero points".
    expect(projectTeam(["p1"], new Map(), scoring)).toBeNull();
    expect(projectTeam(["unknown"], proj, scoring)).toBeNull();
  });

  it("matches a verified Sleeper custom-scoring projection", () => {
    const maye = {
      pass_yd: 245.34,
      pass_td: 1.6,
      pass_int: 0.78,
      pass_sack: 2.39,
      rush_yd: 17.15,
      rush_td: 0.13,
      rush_fd: 1.71,
      pass_2pt: 0.09,
      rush_2pt: 0.01,
      fum_lost: 0.16,
    };
    const scoring = {
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -2,
      pass_sack: -0.25,
      rush_yd: 0.1,
      rush_td: 6,
      rush_fd: 0.5,
      pass_2pt: 2,
      rush_2pt: 2,
      fum_lost: -2,
    };

    expect(projectPlayer(maye, scoring)).toBeCloseTo(17.2861, 4);
  });
});

describe("getTransactions", () => {
  it("only ever emits canonical types", async () => {
    // The recorded fixture contains `commissioner` rows, which is exactly
    // the case that used to be cast straight through into the DB.
    const transactions = await sleeperAdapter.getTransactions(
      creds,
      meta.leagueId,
      meta.season
    );

    expect(transactions.length).toBeGreaterThan(0);
    for (const t of transactions) {
      expect(["add", "drop", "trade", "waiver"]).toContain(t.type);
      expect(() => new Date(t.occurredAt).toISOString()).not.toThrow();
      expect(t.externalId).toBeTruthy();
    }
  });

  it("classifies a commissioner move by what it did", async () => {
    const commissionerRows = (fixture("transactions") as { type: string }[]).filter(
      (t) => t.type === "commissioner"
    );
    expect(commissionerRows.length).toBeGreaterThan(0);

    const transactions = await sleeperAdapter.getTransactions(
      creds,
      meta.leagueId,
      meta.season
    );

    // Every surviving row carries the moves that justified its type.
    for (const t of transactions) {
      if (t.type === "add") expect(t.payload.adds?.length).toBeGreaterThan(0);
      if (t.type === "drop") expect(t.payload.drops?.length).toBeGreaterThan(0);
    }
  });
});
