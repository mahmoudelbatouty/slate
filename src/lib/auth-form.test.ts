import { describe, expect, it } from "vitest";
import { parseAuthSubmission, safeDestination } from "./auth-form";

function form(values: Record<string, string>): Pick<FormData, "get"> {
  return { get: (key: string) => (key in values ? values[key] : null) } as Pick<FormData, "get">;
}

describe("safeDestination", () => {
  it("keeps same-origin paths", () => {
    expect(safeDestination("/admin/connections")).toBe("/admin/connections");
  });

  it("rejects protocol-relative and absolute destinations", () => {
    expect(safeDestination("//evil.example")).toBe("/");
    expect(safeDestination("https://evil.example")).toBe("/");
    expect(safeDestination(null)).toBe("/");
  });
});

describe("parseAuthSubmission", () => {
  it("normalizes the email and destination", () => {
    const result = parseAuthSubmission(
      form({ intent: "signin", email: "  Owner@Example.COM ", password: "longenough", next: "//x" })
    );
    expect(result).toEqual({
      ok: true,
      value: { intent: "signin", email: "owner@example.com", password: "longenough", next: "/" },
    });
  });

  it("rejects an unknown intent", () => {
    const result = parseAuthSubmission(
      form({ intent: "delete", email: "owner@example.com", password: "longenough", next: "/" })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = parseAuthSubmission(
      form({ intent: "signup", email: "owner@", password: "longenough", next: "/" })
    );
    expect(result).toEqual({ ok: false, message: "Enter a valid email address." });
  });

  it("requires eight characters for signin and signup", () => {
    for (const intent of ["signin", "signup"]) {
      const result = parseAuthSubmission(
        form({ intent, email: "owner@example.com", password: "short", next: "/" })
      );
      expect(result).toEqual({
        ok: false,
        message: "Password must be at least 8 characters.",
        email: "owner@example.com",
      });
    }
  });

  it("allows resend and reset with no password", () => {
    for (const intent of ["resend", "reset"]) {
      const result = parseAuthSubmission(form({ intent, email: "owner@example.com" }));
      expect(result.ok).toBe(true);
    }
  });
});
