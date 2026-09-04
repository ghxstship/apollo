import { describe, expect, it } from "vitest";
import {
  anchorCountdown, guaranteeOwed, minutesUntil, otherSide, radarPhase, slotsFor, type RadarClock,
} from "@/lib/radar";

const T0 = Date.UTC(2026, 6, 26, 0, 0);
const at = (h: number) => new Date(T0 + h * 3_600_000).toISOString();
const clock: RadarClock = {
  episode_id: "e", opens_at: at(17.25), locks_at: at(17.5), anchors_unlock_at: at(19),
  anchors_expire_at: at(43), slots: 3, settled_at: null,
};
const now = (h: number) => T0 + h * 3_600_000;

describe("radarPhase", () => {
  it("reads the stored instants, each boundary inclusive of the later phase", () => {
    expect(radarPhase(clock, now(17))).toBe("before");
    expect(radarPhase(clock, now(17.25))).toBe("open");
    expect(radarPhase(clock, now(17.5))).toBe("locked");
    expect(radarPhase(clock, now(19))).toBe("unlocked");
    expect(radarPhase(clock, now(43))).toBe("expired");
  });
  it("no clock is before", () => {
    expect(radarPhase(null)).toBe("before");
  });
});

describe("minutesUntil / anchorCountdown", () => {
  it("floors to whole minutes and stops at the window", () => {
    expect(minutesUntil(at(1), now(0) + 30_000)).toBe(59);
    expect(minutesUntil(at(1), now(1))).toBeNull();
    expect(minutesUntil(at(1), now(2))).toBeNull();
    expect(minutesUntil(null)).toBeNull();
  });
  it("counts the anchor down in hours and minutes, and stops", () => {
    expect(anchorCountdown(at(24), now(0) + 48 * 60_000)).toBe("23:12 LEFT");
    expect(anchorCountdown(at(24), now(0) + (24 * 60 - 5) * 60_000)).toBe("00:05 LEFT");
    expect(anchorCountdown(at(24), now(24))).toBeNull();
  });
});

describe("slotsFor", () => {
  const pin = (passId: string) => ({ passId, name: "N", couple: false, plotted: true });
  it("fills in order and leaves the rest open while the radar is open", () => {
    const open = { ...clock, opens_at: new Date(Date.now() - 60_000).toISOString(), locks_at: new Date(Date.now() + 60_000).toISOString() };
    expect(slotsFor(open, [pin("a")]).map((s) => s.state)).toEqual(["filled", "open", "open"]);
  });
  it("locks the empty slots once the radar is not open", () => {
    expect(slotsFor(clock, [pin("a")]).map((s) => s.state)).toEqual(["filled", "locked", "locked"]);
    expect(slotsFor(null, []).map((s) => s.state)).toEqual(["locked", "locked", "locked"]);
  });
  it("honours the clock's own slot count", () => {
    expect(slotsFor({ ...clock, slots: 2 }, [])).toHaveLength(2);
  });
});

describe("otherSide", () => {
  it("answers the other pass whichever column holds mine", () => {
    const a = { id: "x", episode_id: "e", rsvp_a: "A", rsvp_b: "B", unlocked_at: null, expires_at: at(1) };
    expect(otherSide(a, "A")).toBe("B");
    expect(otherSide(a, "B")).toBe("A");
  });
});

describe("guaranteeOwed", () => {
  it("covers a course plotted and not returned, and nothing else", () => {
    expect(guaranteeOwed(1, 0)).toBe(true);
    expect(guaranteeOwed(3, 0)).toBe(true);
    expect(guaranteeOwed(0, 0)).toBe(false);
    expect(guaranteeOwed(2, 1)).toBe(false);
  });
});
