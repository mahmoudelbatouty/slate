import { describe, expect, it } from "vitest";
import { buildScoreboard, scoreboardSummary, type NflGameRow } from "./nfl-scoreboard";

function row(overrides: Partial<NflGameRow> = {}): NflGameRow {
  return {
    gameId: "g1",
    homeTeam: "HOU",
    awayTeam: "BUF",
    startTime: "2026-09-13T17:00:00.000Z",
    status: "pre_game",
    isOver: false,
    inProgress: false,
    canceled: false,
    quarter: null,
    raw: {},
    ...overrides,
  };
}

describe("buildScoreboard", () => {
  it("reads scores out of the stored provider blob", () => {
    const [game] = buildScoreboard([
      row({ inProgress: true, quarter: "2", raw: { home_score: 10, away_score: 17, time_remaining: "4:12" } }),
    ]);
    expect(game.homePoints).toBe(10);
    expect(game.awayPoints).toBe(17);
    expect(game.leader).toBe("away");
    expect(game.status).toBe("Q2 · 4:12");
  });

  it("renders a missing score as unknown rather than zero", () => {
    const [game] = buildScoreboard([row({ inProgress: true, raw: {} })]);
    expect(game.homePoints).toBeNull();
    expect(game.leader).toBeNull();
  });

  it("labels a finished game and never picks a leader before kickoff", () => {
    const [final, upcoming] = buildScoreboard([
      row({ gameId: "a", isOver: true, raw: { home_score: 31, away_score: 13 } }),
      row({ gameId: "b", awayTeam: "LAC", raw: { home_score: 0, away_score: 0 } }),
    ]);
    expect(final.status).toBe("FINAL");
    expect(final.leader).toBe("home");
    expect(upcoming.leader).toBeNull();
    expect(upcoming.status).toMatch(/^[A-Z]{3} \d/);
  });

  it("drops canceled games", () => {
    expect(buildScoreboard([row({ canceled: true })])).toHaveLength(0);
  });

  it("orders the rail by kickoff, so it reads as the day's timeline", () => {
    const games = buildScoreboard([
      row({ gameId: "sunday-night", startTime: "2026-09-14T00:20:00.000Z" }),
      row({ gameId: "thursday", startTime: "2026-09-11T00:15:00.000Z" }),
      row({ gameId: "sunday-early", startTime: "2026-09-13T17:00:00.000Z" }),
      row({ gameId: "sunday-late", startTime: "2026-09-13T20:25:00.000Z" }),
    ]);
    expect(games.map((game) => game.gameId)).toEqual([
      "thursday",
      "sunday-early",
      "sunday-late",
      "sunday-night",
    ]);
  });

  it("keeps kickoff order regardless of phase, rather than hoisting live games", () => {
    const games = buildScoreboard([
      row({ gameId: "late-pre", startTime: "2026-09-13T20:25:00.000Z" }),
      row({ gameId: "early-live", startTime: "2026-09-13T17:00:00.000Z", inProgress: true }),
      row({ gameId: "earliest-final", startTime: "2026-09-11T00:15:00.000Z", isOver: true }),
    ]);
    expect(games.map((game) => game.gameId)).toEqual(["earliest-final", "early-live", "late-pre"]);
  });

  it("breaks a shared kickoff slot on away team, so simultaneous games hold still", () => {
    const slot = "2026-09-13T17:00:00.000Z";
    const games = buildScoreboard([
      row({ gameId: "c", awayTeam: "NYJ", startTime: slot }),
      row({ gameId: "a", awayTeam: "ATL", startTime: slot }),
      row({ gameId: "b", awayTeam: "BUF", startTime: slot }),
    ]);
    expect(games.map((game) => game.away)).toEqual(["ATL", "BUF", "NYJ"]);
  });

  it("sorts an unscheduled game last rather than leading with it", () => {
    const games = buildScoreboard([
      row({ gameId: "tbd", awayTeam: "ARI", startTime: null }),
      row({ gameId: "scheduled", awayTeam: "ZZZ", startTime: "2026-09-13T17:00:00.000Z" }),
    ]);
    expect(games.map((game) => game.gameId)).toEqual(["scheduled", "tbd"]);
    expect(games[1].status).toBe("TBD");
  });
});

describe("scoreboardSummary", () => {
  it("omits the counts that are zero", () => {
    const games = buildScoreboard([
      row({ gameId: "live", inProgress: true }),
      row({ gameId: "final", isOver: true }),
    ]);
    expect(scoreboardSummary(games)).toBe("1 LIVE · 1 FINAL");
  });

  it("says so when nothing is synced", () => {
    expect(scoreboardSummary([])).toBe("NO GAMES SYNCED");
  });
});
