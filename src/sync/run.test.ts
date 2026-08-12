import { describe, expect, it } from "vitest";
import { weeksFor } from "./run";

describe("weeksFor", () => {
  it("pulls only the current week on a live run", () => {
    // This runs every 5 minutes on gameday, so it must stay at one call
    // per league.
    expect(weeksFor("live", 11)).toEqual([11]);
  });

  it("pulls the whole season so far on a backfill", () => {
    expect(weeksFor("backfill", 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("never reaches past the current week", () => {
    // Weeks that haven't happened have no matchups to fetch.
    expect(weeksFor("backfill", 1)).toEqual([1]);
    expect(weeksFor("backfill", 18).at(-1)).toBe(18);
  });

  it("returns nothing when the season hasn't started", () => {
    expect(weeksFor("backfill", 0)).toEqual([]);
  });
});
