import { describe, expect, it } from "vitest";
import { EMPTY_STARTER_SUMMARY } from "./game-state";
import type { MatchupCard } from "./matchup";
import { buildTickerItems, cardAnchorId } from "./ticker";

function card(over: Partial<MatchupCard> = {}): MatchupCard {
  return {
    leagueId: "l1",
    leagueName: "Sunday Syndicate",
    leagueExternalId: "998877",
    platform: "sleeper",
    leagueStatus: "in_season",
    leagueFormat: "head_to_head",
    leagueType: "dynasty",
    teamCount: 12,
    season: 2026,
    week: 1,
    isFinal: false,
    isLive: true,
    winProbability: 69,
    starterStatus: { mine: EMPTY_STARTER_SUMMARY, opponent: EMPTY_STARTER_SUMMARY },
    syncedAt: null,
    mine: { teamId: "t1", externalId: "1", name: "Let Him Cook!", points: 112.4, projected: 180.4 },
    opponent: { teamId: "t2", externalId: "2", name: "mabushaib", points: 98.7, projected: 163.2 },
    chopped: null,
    scoreboard: [],
    standings: [],
    ...over,
  };
}

describe("buildTickerItems", () => {
  it("shows both scores for a head-to-head week", () => {
    const [item] = buildTickerItems([card()]);
    expect(item.home).toBe("Let Him Cook!");
    expect(item.score).toBe("112.4 – 98.7");
    expect(item.away).toBe("mabushaib");
    expect(item.isMine).toBe(true);
  });

  it("keeps a league with no game in the strip", () => {
    const [item] = buildTickerItems([card({ opponent: null })]);
    expect(item.score).toBe("BYE WEEK");
  });

  it("shows survival standing for a chopped league", () => {
    const [item] = buildTickerItems([
      card({
        leagueFormat: "chopped",
        chopped: {
          standings: [
            { teamId: "t1", name: "Let Him Cook!", points: 0, projected: 128.6, isMine: true },
          ],
          myRank: 4,
          chopZone: null,
          marginAboveChop: 19.4,
        },
      }),
    ]);
    expect(item.score).toBe("128.6 proj");
    expect(item.away).toBe("RANK 4");
  });

  it("says a pre-draft league has nothing to score", () => {
    const [item] = buildTickerItems([card({ leagueStatus: "pre_draft" })]);
    expect(item.score).toBe("PRE-DRAFT");
    expect(item.isMine).toBe(false);
  });

  it("targets a DOM-safe anchor derived from the league identity", () => {
    expect(cardAnchorId(card())).toBe("card-sleeper-998877");
    expect(buildTickerItems([card()])[0].target).toBe("card-sleeper-998877");
  });
});
