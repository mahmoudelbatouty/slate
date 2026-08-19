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

  it("sorts live games first and settled games before kickoffs", () => {
    const games = buildScoreboard([
      row({ gameId: "pre", awayTeam: "ARI" }),
      row({ gameId: "final", awayTeam: "BAL", isOver: true }),
      row({ gameId: "live", awayTeam: "CIN", inProgress: true }),
    ]);
    expect(games.map((game) => game.gameId)).toEqual(["live", "final", "pre"]);
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
