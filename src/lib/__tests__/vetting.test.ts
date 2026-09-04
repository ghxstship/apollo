import { describe, expect, it } from "vitest";
import {
  claimMinutesLeft, hullHeads, isFull, isSegment, remainingToken, seatedHeads, segmentOpen,
  type SegmentCapacityRow, type WaitlistRow,
} from "@/lib/vetting";

const row = (segment: SegmentCapacityRow["segment"], cap: number, units: number): SegmentCapacityRow => ({
  episode_id: "e", segment, cap, units, remaining: cap - units, unsegmented_aboard: 0,
});

describe("isSegment", () => {
  it("admits the three segments and nothing else", () => {
    expect(isSegment("couple")).toBe(true);
    expect(isSegment("single_woman")).toBe(true);
    expect(isSegment("couples")).toBe(false);
    expect(isSegment(null)).toBe(false);
    expect(isSegment(2)).toBe(false);
  });
});

describe("heads", () => {
  const rows = [row("single_woman", 10, 4), row("single_man", 10, 6), row("couple", 5, 2)];
  it("counts a couple as two heads, a single as one", () => {
    expect(seatedHeads(rows)).toBe(4 + 6 + 4);
    expect(hullHeads(rows)).toBe(10 + 10 + 10);
  });
  it("is zero for no rows", () => {
    expect(seatedHeads([])).toBe(0);
    expect(hullHeads([])).toBe(0);
  });
});

describe("the capacity token", () => {
  it("says FULL or how many are left, never a percentage", () => {
    expect(remainingToken(row("couple", 5, 5))).toBe("FULL");
    expect(remainingToken(row("couple", 5, 3))).toBe("2 LEFT");
    expect(isFull(row("couple", 5, 5))).toBe(true);
    expect(isFull(row("couple", 5, 4))).toBe(false);
  });
  it("a segment is open only when it exists and has room", () => {
    const rows = [row("single_woman", 10, 10), row("couple", 5, 3)];
    expect(segmentOpen(rows, "couple")).toBe(true);
    expect(segmentOpen(rows, "single_woman")).toBe(false);
    expect(segmentOpen(rows, "single_man")).toBe(false);
  });
});

describe("claimMinutesLeft", () => {
  const T0 = Date.UTC(2026, 6, 26);
  const entry = (over: Partial<WaitlistRow>): WaitlistRow => ({
    claim_expires_at: new Date(T0 + 6 * 3_600_000).toISOString(), claimed_at: null, released_at: null,
    ...over,
  } as WaitlistRow);
  it("counts a live offer down in whole minutes", () => {
    expect(claimMinutesLeft(entry({}), T0 + 30_000)).toBe(359);
  });
  it("is null with no offer, a taken offer, a released offer, or an expired one", () => {
    expect(claimMinutesLeft(entry({ claim_expires_at: null }), T0)).toBeNull();
    expect(claimMinutesLeft(entry({ claimed_at: new Date(T0).toISOString() }), T0)).toBeNull();
    expect(claimMinutesLeft(entry({ released_at: new Date(T0).toISOString() }), T0)).toBeNull();
    expect(claimMinutesLeft(entry({}), T0 + 7 * 3_600_000)).toBeNull();
  });
});
