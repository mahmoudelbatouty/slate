import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppHeader } from "./AppHeader";
import { AroundTheLeague } from "./AroundTheLeague";
import { ScoreTicker } from "./ScoreTicker";
import { buildScoreboard } from "@/lib/nfl-scoreboard";
import type { TickerItem } from "@/lib/ticker";

const identity = { firstName: "Mahmoud", lastName: "Elbatouty", email: "owner@example.com" };

function header(over: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  return renderToStaticMarkup(
    <AppHeader
      week={1}
      identity={identity}
      connected={["sleeper"]}
      liveCount={4}
      leagueCount={12}
      lastSyncedAt="2026-09-13T20:50:00.000Z"
      accountOpen={false}
      onToggleAccount={() => {}}
      onConnectPlatform={() => {}}
      {...over}
    />
  );
}

describe("AppHeader", () => {
  it("leads with the selected week and the account initials", () => {
    const markup = header();
    expect(markup).toContain("Week 1");
    expect(markup).toContain("ME");
    expect(markup).toContain("4 LIVE");
    expect(markup).toContain("12 LEAGUES");
  });

  it("hides the live count when nothing is playing", () => {
    expect(header({ liveCount: 0 })).not.toContain("LIVE");
  });

  it("says so when no league is connected", () => {
    expect(header({ leagueCount: 0, lastSyncedAt: null })).toContain("NO LEAGUES CONNECTED");
  });

  it("reads as preseason when no week is selected", () => {
    expect(header({ week: null })).toContain("Preseason");
  });

  it("offers a connect control for a platform that is not connected", () => {
    const markup = header({ connected: ["sleeper"] });
    expect(markup).toContain("Connect ESPN");
    expect(markup).toContain("Connect Yahoo");
    expect(markup).toContain("Sleeper is connected");
  });
});

describe("ScoreTicker", () => {
  const items: TickerItem[] = [
    { key: "sleeper:1", target: "card-sleeper-1", home: "Let Him Cook!", score: "112.4 – 98.7", away: "mabushaib", isMine: true },
  ];

  it("renders the item list twice so the loop has no seam", () => {
    const markup = renderToStaticMarkup(<ScoreTicker items={items} />);
    expect(markup.match(/>Let Him Cook!</g)).toHaveLength(2);
    expect(markup).toContain("ticker-run");
  });

  it("renders nothing when there is nothing to report", () => {
    expect(renderToStaticMarkup(<ScoreTicker items={[]} />)).toBe("");
  });
});

describe("AroundTheLeague", () => {
  it("summarizes the real NFL week above the game boxes", () => {
    const games = buildScoreboard([
      {
        gameId: "g1",
        homeTeam: "HOU",
        awayTeam: "BUF",
        startTime: "2026-09-13T17:00:00.000Z",
        status: "in_game",
        isOver: false,
        inProgress: true,
        canceled: false,
        quarter: "2",
        raw: { home_score: 10, away_score: 17 },
      },
    ]);
    const markup = renderToStaticMarkup(<AroundTheLeague games={games} week={1} />);
    expect(markup).toContain("AROUND THE LEAGUE");
    expect(markup).toContain("1 LIVE");
    expect(markup).toContain("BUF");
    expect(markup).toContain("17");
  });

  it("stays out of the way when no games have synced", () => {
    expect(renderToStaticMarkup(<AroundTheLeague games={[]} week={1} />)).toBe("");
  });
});
