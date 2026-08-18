import { describe, expect, it } from "vitest";
import {
  byDrama,
  buildLeagueScoreboard,
  deepLink,
  MONOGRAM,
  orderLeagueStandings,
  type MatchupCard,
  type Platform,
} from "./matchup";
import { EMPTY_STARTER_SUMMARY } from "./game-state";

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
    leagueFormat: "head_to_head",
    leagueType: "redraft",
    teamCount: 12,
    season: 2026,
    week: 11,
    isFinal: false,
    isLive: false,
    winProbability: null,
    starterStatus: {
      mine: EMPTY_STARTER_SUMMARY,
      opponent: EMPTY_STARTER_SUMMARY,
    },
    syncedAt: null,
    mine: { teamId: "t1", externalId: "1", name: "Mine", points: mine, projected: null },
    opponent: {
      teamId: "t2",
      externalId: "2",
      name: "Theirs",
      points: theirs,
      projected: null,
    },
    chopped: null,
    scoreboard: [],
    standings: [],
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

describe("buildLeagueScoreboard", () => {
  const starterStatus = EMPTY_STARTER_SUMMARY;
  const teams = [
    { teamId: "a", externalId: "1", name: "Mine", points: 80, projected: 110, isMine: true, starterStatus },
    { teamId: "b", externalId: "2", name: "Opponent", points: 75, projected: 105, isMine: false, starterStatus },
    { teamId: "c", externalId: "3", name: "Third", points: 40, projected: 90, isMine: false, starterStatus },
    { teamId: "d", externalId: "4", name: "Fourth", points: 45, projected: 95, isMine: false, starterStatus },
  ];
  const rows = [
    { matchupKey: "two", teamId: "c", opponentTeamId: "d", points: 40, projected: 90, isFinal: false },
    { matchupKey: "one", teamId: "b", opponentTeamId: "a", points: 75, projected: 105, isFinal: false },
    { matchupKey: "two", teamId: "d", opponentTeamId: "c", points: 45, projected: 95, isFinal: false },
    { matchupKey: "one", teamId: "a", opponentTeamId: "b", points: 80, projected: 110, isFinal: false },
  ];

  it("pairs reciprocal rows without duplicating games", () => {
    const games = buildLeagueScoreboard(rows, teams);
    expect(games).toHaveLength(2);
    expect(games.map((game) => game.key)).toEqual(["one", "two"]);
  });

  it("puts the user's team on the left in the first game", () => {
    const [game] = buildLeagueScoreboard(rows, teams);
    expect(game.left.name).toBe("Mine");
    expect(game.right?.name).toBe("Opponent");
  });

  it("keeps an unpaired bye instead of inventing an opponent", () => {
    const [game] = buildLeagueScoreboard(
      [{ matchupKey: "bye", teamId: "a", opponentTeamId: null, points: 10, projected: 20, isFinal: false }],
      teams
    );
    expect(game.right).toBeNull();
  });
});

describe("orderLeagueStandings", () => {
  const standing = (name: string, rank: number | null, wins: number, pointsFor: number) => ({
    teamId: name,
    name,
    managerName: null,
    isMine: false,
    wins,
    losses: 0,
    ties: 0,
    pointsFor,
    pointsAgainst: 0,
    standing: rank,
  });

  it("honors provider rank before local record fields", () => {
    const ordered = orderLeagueStandings([
      standing("Second", 2, 10, 2000),
      standing("First", 1, 1, 100),
    ]);
    expect(ordered.map((team) => team.name)).toEqual(["First", "Second"]);
  });

  it("puts missing provider ranks last with a deterministic fallback order", () => {
    const ordered = orderLeagueStandings([
      standing("Unranked", null, 8, 1200),
      standing("Ranked", 1, 1, 100),
      standing("Higher points", null, 8, 1300),
    ]);
    expect(ordered.map((team) => team.name)).toEqual(["Ranked", "Higher points", "Unranked"]);
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

describe("MONOGRAM", () => {
  it("covers every platform with two characters", () => {
    const platforms: Platform[] = ["sleeper", "espn", "yahoo"];
    for (const platform of platforms) {
      expect(MONOGRAM[platform]).toHaveLength(2);
    }
  });
});
