import { describe, expect, it } from "vitest";
import { missingWeeksFor, weeksFor } from "./run";

describe("weeksFor", () => {
  it("pulls only the current week on a live run", () => {
    // This runs every minute on gameday, so it must stay at one call
    // per league.
    expect(weeksFor("live", 11)).toEqual([11]);
  });

  it("pulls the whole season on a backfill", () => {
    expect(weeksFor("backfill", 5)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1)
    );
  });

  it("uses provider season-end metadata while never hiding the current week", () => {
    expect(weeksFor("backfill", 1, 17).at(-1)).toBe(17);
    expect(weeksFor("backfill", 18, 17).at(-1)).toBe(18);
  });

  it("returns nothing when the season hasn't started", () => {
    expect(weeksFor("backfill", 0)).toEqual([]);
  });
});

describe("missingWeeksFor", () => {
  it("fills absent schedule weeks and still refreshes the current week", () => {
    expect(missingWeeksFor(2, [2, 3, 4], 5)).toEqual([1, 2, 5]);
  });

  it("falls back to the current week once the full schedule exists", () => {
    expect(missingWeeksFor(2, [1, 2, 3], 3)).toEqual([2]);
  });
});
