import { describe, expect, it } from "vitest";
import { displayName, initials } from "./account";

describe("initials", () => {
  it("uses the name when one was given", () => {
    expect(initials({ firstName: "Mahmoud", lastName: "Elbatouty", email: "m@e.com" })).toBe("ME");
  });

  it("accepts a partial name", () => {
    expect(initials({ firstName: "Mahmoud", lastName: null, email: null })).toBe("M");
  });

  it("falls back to a structured email local part", () => {
    expect(initials({ firstName: null, lastName: null, email: "mahmoud.elbatouty@example.com" })).toBe("ME");
    expect(initials({ firstName: null, lastName: null, email: "slate@example.com" })).toBe("SL");
  });

  it("never renders blank", () => {
    expect(initials({ firstName: null, lastName: null, email: null })).toBe("—");
  });
});

describe("displayName", () => {
  it("prefers the full name, then the email local part", () => {
    expect(displayName({ firstName: "Mahmoud", lastName: "Elbatouty", email: null })).toBe("Mahmoud Elbatouty");
    expect(displayName({ firstName: null, lastName: null, email: "owner@example.com" })).toBe("owner");
    expect(displayName({ firstName: null, lastName: null, email: null })).toBe("Slate account");
  });
});
