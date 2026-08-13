import { describe, expect, it } from "vitest";
import {
  byDrama,
  deepLink,
  MONOGRAM,
  resolveWeek,
  type MatchupCard,
  type Platform,
} from "./matchup";

function card(
  over: Omit<Partial<MatchupCard>, "mine"> & { mine?: number; theirs?: number }
): MatchupCard {
  const { mine = 0, theirs = 0, ...rest } = over;
  return {
    leagueId: "l1",
    leagueName: "Dynasty Degenerates",
    leagueExternalId: "1313273030905974784",
    platform: "sleeper",
    leagueStatus: "in_season",
    teamCount: 12,
    season: 2026,
    week: 11,
    isFinal: false,
    isLive: false,
    winProbability: null,
    remaining: 0,
    syncedAt: null,
    mine: { teamId: "t1", externalId: "1", name: "Mine", points: mine, projected: null },
    opponent: {
      teamId: "t2",
      externalId: "2",
      name: "Theirs",
      points: theirs,
      projected: null,
    },
    ...rest,
  };
}

describe("byDrama", () => {
  it("puts the closest margin first", () => {
    const wide = card({ mine: 100, theirs: 40, leagueId: "wide" });
    const close = card({ mine: 90, theirs: 88, leagueId: "close" });
    const mid = card({ mine: 90, theirs: 75, leagueId: "mid" });

    const order = [wide, close, mid].sort(byDrama).map((c) => c.leagueId);
    expect(order).toEqual(["close", "mid", "wide"]);
  });

  it("sinks finals below anything still playing", () => {
    // A one-point final is settled; a 40-point live game is not.
    const settled = card({ mine: 100, theirs: 99, isFinal: true, leagueId: "final" });
    const blowout = card({ mine: 100, theirs: 60, leagueId: "live" });

    expect([settled, blowout].sort(byDrama).map((c) => c.leagueId)).toEqual([
      "live",
      "final",
    ]);
  });

  it("treats a missing opponent as a zero score rather than crashing", () => {
    const solo = card({ mine: 50, opponent: null, leagueId: "solo" });
    expect(() => [solo, card({ mine: 1, theirs: 1 })].sort(byDrama)).not.toThrow();
  });

  it("places pre-draft leagues after active matchups", () => {
    const preDraft = card({ leagueStatus: "pre_draft", leagueId: "pre" });
    const active = card({ leagueId: "active" });
    expect([preDraft, active].sort(byDrama).map((item) => item.leagueId)).toEqual([
      "active",
      "pre",
    ]);
  });
});

describe("deepLink", () => {
  it("builds the Sleeper team URL", () => {
    expect(deepLink(card({})).href).toBe(
      "https://sleeper.com/leagues/1313273030905974784/team"
    );
  });

  it("builds a league URL before the draft creates a matchup", () => {
    expect(deepLink(card({ leagueStatus: "pre_draft" })).href).toBe(
      "https://sleeper.com/leagues/1313273030905974784"
    );
  });

  it("builds the ESPN URL with team and season", () => {
    const link = deepLink(card({ platform: "espn", leagueExternalId: "44332" }));
    expect(link.href).toBe(
      "https://fantasy.espn.com/football/team?leagueId=44332&teamId=1&seasonId=2026"
    );
    expect(link.label).toBe("Open in ESPN");
  });

  it("builds the ESPN league URL before the draft", () => {
    expect(
      deepLink(card({
        platform: "espn",
        leagueExternalId: "44332",
        leagueStatus: "pre_draft",
      })).href
    ).toBe("https://fantasy.espn.com/football/league?leagueId=44332");
  });

  it("builds the Yahoo URL from league and team keys", () => {
    const link = deepLink(card({ platform: "yahoo", leagueExternalId: "nfl.l.123456" }));
    expect(link.href).toBe(
      "https://football.fantasysports.yahoo.com/f1/nfl.l.123456/1"
    );
  });

  it("builds the Yahoo league URL before the draft", () => {
    expect(
      deepLink(card({
        platform: "yahoo",
        leagueExternalId: "nfl.l.123456",
        leagueStatus: "pre_draft",
      })).href
    ).toBe("https://football.fantasysports.yahoo.com/f1/nfl.l.123456");
  });
});

describe("resolveWeek", () => {
  const weeks = [1, 2, 3, 4, 5];

  it("honours a week that exists", () => {
    expect(resolveWeek(3, weeks, 5)).toBe(3);
  });

  it("defaults to the current week when none was asked for", () => {
    expect(resolveWeek(undefined, weeks, 5)).toBe(5);
  });

  it("falls back rather than showing a week that isn't there", () => {
    // ?week= is hand-typeable and shareable, so it gets everything.
    expect(resolveWeek(99, weeks, 5)).toBe(5);
    expect(resolveWeek(0, weeks, 5)).toBe(5);
    expect(resolveWeek(-3, weeks, 5)).toBe(5);
    expect(resolveWeek(2.5, weeks, 5)).toBe(5);
    expect(resolveWeek(NaN, weeks, 5)).toBe(5);
  });

  it("stays null in the preseason when there's no week at all", () => {
    expect(resolveWeek(4, [], null)).toBeNull();
    expect(resolveWeek(undefined, [], null)).toBeNull();
  });
});

describe("MONOGRAM", () => {
  it("covers every platform with two characters", () => {
    const platforms: Platform[] = ["sleeper", "espn", "yahoo"];
    for (const platform of platforms) {
      expect(MONOGRAM[platform]).toHaveLength(2);
    }
  });
});
