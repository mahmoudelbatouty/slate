import { describe, expect, it } from "vitest";
import { buildWeekOptions, resolveWeek } from "./weeks";

describe("buildWeekOptions", () => {
  it("shows the full default season during preseason", () => {
    const weeks = buildWeekOptions([{ currentWeek: null }], []);

    expect(weeks).toHaveLength(18);
    expect(weeks.every((week) => !week.hasData && !week.isCurrent)).toBe(true);
  });

  it("keeps the full season visible when only one week is synced", () => {
    const weeks = buildWeekOptions([{ currentWeek: 1 }], [1]);

    expect(weeks).toHaveLength(18);
    expect(weeks[0]).toEqual({ week: 1, hasData: true, isCurrent: true });
    expect(weeks[1]).toEqual({ week: 2, hasData: false, isCurrent: false });
  });

  it("marks historical synced weeks independently from the current week", () => {
    const weeks = buildWeekOptions([{ currentWeek: 5 }], [1, 3, 5]);

    expect(weeks[2]).toEqual({ week: 3, hasData: true, isCurrent: false });
    expect(weeks[4]).toEqual({ week: 5, hasData: true, isCurrent: true });
  });

  it("keeps an unsynced week selectable", () => {
    const weeks = buildWeekOptions([{ currentWeek: 5 }], [1, 5]);

    expect(weeks[3]).toEqual({ week: 4, hasData: false, isCurrent: false });
    expect(resolveWeek(4, weeks.map((week) => week.week), 5)).toBe(4);
  });

  it("uses the furthest current week when leagues disagree", () => {
    const weeks = buildWeekOptions(
      [{ currentWeek: 4 }, { currentWeek: 6 }],
      [4, 6]
    );

    expect(weeks.filter((week) => week.isCurrent).map((week) => week.week)).toEqual([6]);
  });

  it("incorporates provider playoff metadata", () => {
    const weeks = buildWeekOptions(
      [{
        currentWeek: 1,
        scoringRaw: { settings: { playoff_week_start: 15, playoff_teams: 6 } },
      }],
      [1]
    );

    expect(weeks.at(-1)?.week).toBe(17);
  });
});

describe("resolveWeek", () => {
  const available = Array.from({ length: 18 }, (_, index) => index + 1);

  it("honours historical and future season weeks", () => {
    expect(resolveWeek(3, available, 8)).toBe(3);
    expect(resolveWeek(12, available, 8)).toBe(12);
  });

  it("falls back to current for invalid URL values", () => {
    expect(resolveWeek(99, available, 8)).toBe(8);
    expect(resolveWeek(0, available, 8)).toBe(8);
    expect(resolveWeek(-3, available, 8)).toBe(8);
    expect(resolveWeek(2.5, available, 8)).toBe(8);
    expect(resolveWeek(Number.NaN, available, 8)).toBe(8);
  });

  it("stays in preseason by default but permits a valid requested week", () => {
    expect(resolveWeek(undefined, available, null)).toBeNull();
    expect(resolveWeek(4, available, null)).toBe(4);
  });
});
