import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATIONS,
  parseHiddenLeagues,
  parseNotifications,
  serialize,
  toggle,
} from "./preferences";

describe("parseNotifications", () => {
  it("falls back to the defaults when nothing is stored", () => {
    expect(parseNotifications(null)).toEqual(DEFAULT_NOTIFICATIONS);
    expect(parseNotifications("not json")).toEqual(DEFAULT_NOTIFICATIONS);
  });

  it("keeps an explicitly empty selection", () => {
    expect(parseNotifications(serialize([]))).toEqual([]);
  });

  it("drops keys this build no longer knows about", () => {
    expect(parseNotifications(serialize(["close", "trade-offer"]))).toEqual(["close"]);
  });
});

describe("parseHiddenLeagues", () => {
  it("defaults to hiding nothing", () => {
    expect(parseHiddenLeagues(null)).toEqual([]);
    expect(parseHiddenLeagues(JSON.stringify({ version: 2, keys: ["a"] }))).toEqual([]);
  });

  it("reads back what was written, without duplicates", () => {
    expect(parseHiddenLeagues(serialize(["sleeper:1", "sleeper:1", "espn:9"]))).toEqual([
      "sleeper:1",
      "espn:9",
    ]);
  });
});

describe("toggle", () => {
  it("adds a missing value and removes a present one", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});
