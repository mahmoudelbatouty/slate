import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScoresResponse } from "./scores";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "sleeper", "scores.json"), "utf8")
);

describe("Sleeper scores parser", () => {
  it("normalizes the recorded GraphQL response into canonical game state", () => {
    const games = parseScoresResponse(fixture, "nfl", 2025, 11);
    expect(games).toHaveLength(15);
    expect(games[0]).toMatchObject({
      sport: "nfl",
      season: 2025,
      week: 11,
      seasonType: "regular",
    });
    expect(games[0].startTime).toMatch(/^2025-/);
    expect(games.every((game) => game.homeTeam && game.awayTeam)).toBe(true);
  });

  it("preserves defenses' team abbreviation join keys", () => {
    const games = parseScoresResponse(fixture, "nfl", 2025, 11);
    const teams = new Set(games.flatMap((game) => [game.homeTeam, game.awayTeam]));
    expect(teams.has("BUF")).toBe(true);
    expect([...teams].every((team) => team === null || team === team.toUpperCase())).toBe(true);
  });

  it("rejects a schema drift instead of leaking platform-shaped data", () => {
    expect(() => parseScoresResponse({ data: { scores: [{ game_id: 1 }] } }, "nfl", 2025, 11)).toThrow();
  });

  it("surfaces GraphQL errors to the sync containment layer", () => {
    expect(() => parseScoresResponse({ data: null, errors: [{ message: "down" }] }, "nfl", 2025, 11)).toThrow("down");
  });
});
