import { describe, expect, it } from "vitest";
import { playerGameLabel } from "./player-state";

const game = {
  opponent: "SEA",
  startTime: "2026-09-10T00:20:00.000Z",
  status: null,
  isOver: false,
  inProgress: false,
  canceled: false,
  quarter: null,
};

describe("playerGameLabel", () => {
  it("labels every selected-week state explicitly", () => {
    expect(playerGameLabel({ game: null })).toBe("BYE / TBD");
    expect(playerGameLabel({ game: { ...game, canceled: true } })).toBe("CANCELED");
    expect(playerGameLabel({ game: { ...game, isOver: true } })).toBe("PLAYED · vs SEA");
    expect(playerGameLabel({ game: { ...game, inProgress: true, quarter: "Q2" } })).toBe("LIVE Q2");
    expect(playerGameLabel({ game })).toBe("TO PLAY · vs SEA · WED 8:20 PM");
  });
});
