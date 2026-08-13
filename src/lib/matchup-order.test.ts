import { describe, expect, it } from "vitest";
import type { MatchupCard } from "./matchup";
import {
  matchupOrderKey,
  moveMatchupCard,
  orderMatchupCards,
  parseStoredMatchupOrder,
  updatePreferredKeys,
} from "./matchup-order";

function card(platform: MatchupCard["platform"], leagueExternalId: string): MatchupCard {
  return { platform, leagueExternalId } as MatchupCard;
}

describe("matchup ordering", () => {
  const sleeperA = card("sleeper", "1");
  const sleeperB = card("sleeper", "2");
  const yahooA = card("yahoo", "1");

  it("uses a platform-qualified stable league key", () => {
    expect(matchupOrderKey(sleeperA)).toBe("sleeper:1");
    expect(matchupOrderKey(yahooA)).toBe("yahoo:1");
  });

  it("applies saved order and appends newly discovered leagues", () => {
    expect(orderMatchupCards(
      [sleeperA, sleeperB, yahooA],
      ["sleeper:2", "sleeper:1"]
    )).toEqual([sleeperB, sleeperA, yahooA]);
  });

  it("moves a visible card to the target position", () => {
    expect(moveMatchupCard(
      [sleeperA, sleeperB, yahooA],
      "yahoo:1",
      "sleeper:1"
    )).toEqual([yahooA, sleeperA, sleeperB]);
  });

  it("retains hidden-week leagues while updating visible order", () => {
    expect(updatePreferredKeys(
      ["sleeper:1", "espn:hidden", "sleeper:2"],
      ["sleeper:2", "sleeper:1"]
    )).toEqual(["sleeper:2", "espn:hidden", "sleeper:1"]);
  });

  it("rejects malformed storage and deduplicates valid keys", () => {
    expect(parseStoredMatchupOrder("not json")).toEqual([]);
    expect(parseStoredMatchupOrder(JSON.stringify({ version: 2, keys: [] }))).toEqual([]);
    expect(parseStoredMatchupOrder(JSON.stringify({
      version: 1,
      keys: ["sleeper:1", "sleeper:1", "yahoo:1"],
    }))).toEqual(["sleeper:1", "yahoo:1"]);
  });
});
