import { describe, expect, it } from "vitest";
import { readAll, readAllIn } from "./read-all";

function rows(count: number, offset = 0): { id: number }[] {
  return Array.from({ length: count }, (_, i) => ({ id: offset + i }));
}

/** Stands in for PostgREST: hard-caps every response at 1000 rows. */
function table(total: number) {
  const calls: [number, number][] = [];
  return {
    calls,
    read: (from: number, to: number) => {
      calls.push([from, to]);
      const size = Math.min(to - from + 1, Math.max(0, total - from));
      return Promise.resolve({ data: rows(size, from), error: null });
    },
  };
}

describe("readAll", () => {
  it("returns everything past the 1000-row response cap", async () => {
    const source = table(1488);
    const all = await readAll(source.read, "roster entries");
    expect(all).toHaveLength(1488);
    expect(source.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("stops after one request when the first page is short", async () => {
    const source = table(12);
    expect(await readAll(source.read, "teams")).toHaveLength(12);
    expect(source.calls).toHaveLength(1);
  });

  it("asks once more when the total lands exactly on the cap", async () => {
    const source = table(1000);
    expect(await readAll(source.read, "matchups")).toHaveLength(1000);
    expect(source.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("labels the failure so the caller knows which read broke", async () => {
    await expect(
      readAll(() => Promise.resolve({ data: null, error: { message: "boom" } }), "lineup read")
    ).rejects.toThrow("lineup read: boom");
  });

  it("treats a null payload as the end", async () => {
    expect(await readAll(() => Promise.resolve({ data: null, error: null }), "teams")).toEqual([]);
  });
});

describe("readAllIn", () => {
  it("splits a long id list into batches so the URL stays sendable", async () => {
    const seen: string[][] = [];
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);

    const all = await readAllIn(
      ids,
      (chunk) => {
        seen.push(chunk);
        return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });
      },
      "lineup player read"
    );

    expect(seen.map((chunk) => chunk.length)).toEqual([200, 200, 50]);
    expect(all).toHaveLength(450);
  });

  it("does not call out at all for an empty list", async () => {
    let called = false;
    const all = await readAllIn(
      [],
      () => {
        called = true;
        return Promise.resolve({ data: [], error: null });
      },
      "lineup player read"
    );
    expect(all).toEqual([]);
    expect(called).toBe(false);
  });
});
