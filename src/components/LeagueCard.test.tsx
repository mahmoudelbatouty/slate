import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LeagueCard, MirroredBench, buildBoxScore, marginLabel } from "./LeagueCard";
import { EMPTY_STARTER_SUMMARY, type StarterSummary } from "@/lib/game-state";
import type { MatchupCard, MatchupPlayer } from "@/lib/matchup";

function summary(over: Partial<StarterSummary> = {}): StarterSummary {
  return { ...EMPTY_STARTER_SUMMARY, ...over };
}

function player(over: Partial<MatchupPlayer> = {}): MatchupPlayer {
  return {
    externalPlayerId: "4046",
    name: "Josh Allen",
    position: "QB",
    nflTeam: "BUF",
    slot: "QB",
    isStarter: true,
    lineupOrder: 0,
    currentPoints: 24.5,
    projectedPoints: 21.2,
    injuryStatus: null,
    game: null,
    ...over,
  };
}

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
    starterStatus: { mine: summary({ remaining: 11 }), opponent: summary({ remaining: 9 }) },
    syncedAt: "2026-09-13T20:50:00.000Z",
    mine: { teamId: "t1", externalId: "1", name: "Let Him Cook!", points: 112.4, projected: 180.4 },
    opponent: { teamId: "t2", externalId: "2", name: "mabushaib", points: 98.7, projected: 163.2 },
    chopped: null,
    scoreboard: [],
    standings: [],
    ...over,
  };
}

function render(value: MatchupCard): string {
  return renderToStaticMarkup(<LeagueCard card={value} />);
}

describe("LeagueCard", () => {
  it("shows a live head-to-head week with win odds and what is left", () => {
    const markup = render(card());
    expect(markup).toContain("Let Him Cook!");
    expect(markup).toContain("112.4");
    expect(markup).toContain("YOU 69%");
    expect(markup).toContain("OPP 31%");
    expect(markup).toContain("YOU 11 LEFT · OPP 9 LEFT");
    expect(markup).toContain("LIVE");
  });

  it("marks a league with no opponent as a bye and mutes the accent", () => {
    const markup = render(card({ opponent: null, isLive: false }));
    expect(markup).toContain("BYE");
    expect(markup).toContain("bg-mark-off");
    expect(markup).toContain("No opponent this week");
  });

  it("says a pre-draft league has nothing to score and drops the accent bar", () => {
    const markup = render(card({ leagueStatus: "pre_draft", isLive: false }));
    expect(markup).toContain("PRE-DRAFT");
    expect(markup).toContain("border-dashed");
    expect(markup).not.toContain("bg-amber");
  });

  it("colors a finished week by who won", () => {
    const markup = render(card({ isFinal: true, isLive: false }));
    expect(markup).toContain("FINAL");
    expect(markup).toContain("won by 13.7");
    expect(markup).toContain("text-turf");
  });

  it("leads a chopped league with survival rank, not a fake head-to-head", () => {
    const markup = render(
      card({
        leagueFormat: "chopped",
        opponent: null,
        chopped: {
          standings: [
            { teamId: "t9", name: "Bench Mob", points: 88, projected: 109.2, isMine: false },
            { teamId: "t1", name: "Let Him Cook!", points: 112.4, projected: 128.6, isMine: true },
          ],
          myRank: 4,
          chopZone: { teamId: "t9", name: "Bench Mob", points: 88, projected: 109.2, isMine: false },
          marginAboveChop: 19.4,
        },
      })
    );
    expect(markup).toContain("SURVIVAL RANK");
    expect(markup).toContain("Bench Mob");
    expect(markup).toContain("CHOPPING BLOCK ↓");
    expect(markup).not.toContain("WIN ODDS");
  });

  it("flags a failed provider run instead of pretending the scores are fresh", () => {
    const markup = renderToStaticMarkup(
      <LeagueCard card={card({ syncFailure: { message: "espn 500", at: null }, isLive: false })} />
    );
    expect(markup).toContain("SYNC FAILED");
    expect(markup).toContain("RETRY SYNC");
    expect(markup).toContain("border-flag");
  });
});

describe("buildBoxScore", () => {
  it("groups starters by position and totals every slot", () => {
    const rows = buildBoxScore(
      [player(), player({ externalPlayerId: "1", position: "RB", currentPoints: 10 })],
      [player({ externalPlayerId: "2", position: "DEF", currentPoints: 6 })]
    );
    expect(rows.find((row) => row.label === "QB")).toEqual({ label: "QB", mine: 24.5, opponent: 0 });
    expect(rows.find((row) => row.label === "K / DEF")?.opponent).toBe(6);
    expect(rows.at(-1)).toEqual({ label: "TOTAL", mine: 34.5, opponent: 6 });
  });

  it("counts a missing score as zero rather than dropping the player", () => {
    const rows = buildBoxScore([player({ currentPoints: null })], []);
    expect(rows.at(-1)?.mine).toBe(0);
  });
});

describe("marginLabel", () => {
  it("reads differently once a week is settled", () => {
    expect(marginLabel(13.7, false)).toBe("up 13.7");
    expect(marginLabel(-13.7, true)).toBe("lost by 13.7");
    expect(marginLabel(0, true)).toBe("tied");
  });
});

describe("MirroredBench", () => {
  const mine = [
    player({ externalPlayerId: "b1", name: "Tyjae Spears", position: "RB", slot: "BN", projectedPoints: 11.2, currentPoints: null }),
    player({ externalPlayerId: "b2", name: "Dalton Kincaid", position: "TE", slot: "BN", projectedPoints: 8.91, currentPoints: null, injuryStatus: "Questionable" }),
  ];
  const theirs = [
    player({ externalPlayerId: "b3", name: "Bo Nix", position: "QB", slot: "BN", projectedPoints: 15.02, currentPoints: null }),
  ];

  it("shows the opponent's bench beside your own", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={mine} opponent={theirs} flagged={1} />);
    expect(markup).toContain("Tyjae Spears");
    expect(markup).toContain("Bo Nix");
  });

  it("counts both sides in the header, flags included", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={mine} opponent={theirs} flagged={1} />);
    expect(markup).toContain("YOU 2");
    expect(markup).toContain("1 FLAG");
    expect(markup).toContain("OPP 1");
  });

  it("pairs by position in each list, since a bench has no slots to align", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={mine} opponent={theirs} flagged={0} />);
    // Row 1 pairs both first reserves; row 2 has only yours, so the opponent
    // half falls back to the em dash rather than shifting a player up.
    expect(markup.indexOf("Tyjae Spears")).toBeLessThan(markup.indexOf("Dalton Kincaid"));
    expect(markup).toContain("—");
  });

  it("renders as many rows as the longer bench", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={mine} opponent={theirs} flagged={0} />);
    expect(markup.match(/grid-cols-\[minmax\(0,1fr\)_62px_62px_minmax\(0,1fr\)\]/g)).toHaveLength(2);
  });

  it("leads with projections, because nobody on a bench has played", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={mine} opponent={theirs} flagged={0} />);
    expect(markup).toContain("11.2");
    expect(markup).toContain("15.02");
    expect(markup).toContain("PROJ");
  });

  it("tints only the flagged player's own half", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={mine} opponent={theirs} flagged={1} />);
    expect(markup.match(/text-flag/g)).toHaveLength(1);
  });

  it("says so when neither side has a synced bench", () => {
    const markup = renderToStaticMarkup(<MirroredBench mine={[]} opponent={[]} flagged={0} />);
    expect(markup).toContain("No bench players synced");
  });
});
