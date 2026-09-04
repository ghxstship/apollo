import { describe, expect, it } from "vitest";
import {
  boardWindow, criticalPathGaps, uncoveredPhases, DECK_FLAGS, DECK_STATES, FIVE_A_PHASES,
  POD_LABEL, POD_STATES, type RunOfShowRow,
} from "@/lib/show";

describe("boardWindow", () => {
  it("cuts the seconds Postgres appends", () => {
    expect(boardWindow("11:00:00", "13:30:00")).toBe("11:00–13:30");
  });
  it("an open-ended window prints the start alone", () => {
    expect(boardWindow("19:00:00", null)).toBe("19:00 on");
  });
});

describe("uncoveredPhases", () => {
  it("names every phase when nothing is planned, in arc order", () => {
    expect(uncoveredPhases([])).toEqual([...FIVE_A_PHASES]);
  });
  it("names only the phase with no element", () => {
    const rows = FIVE_A_PHASES.filter((p) => p !== "afterglow").map((five_a) => ({ five_a }));
    expect(uncoveredPhases(rows)).toEqual(["afterglow"]);
  });
  it("is empty when every phase has an element", () => {
    expect(uncoveredPhases(FIVE_A_PHASES.map((five_a) => ({ five_a })))).toEqual([]);
  });
});

describe("criticalPathGaps", () => {
  it("reports critical-path rows and nothing else", () => {
    const row = (id: string, critical_path: boolean): RunOfShowRow => ({
      id, episode_id: "e", position: 1, window_start: "11:00:00", window_end: null, stage: "deck",
      cue: "x", staff_lead: null, sound: null, bpm: null, five_a: null, critical_path,
    });
    expect(criticalPathGaps([row("a", true), row("b", false), row("c", true)]).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("the state tables", () => {
  it("draw one flag for every deck state and one badge for every pod state", () => {
    for (const s of DECK_STATES) expect(DECK_FLAGS[s].label).toBeTruthy();
    for (const s of POD_STATES) expect(POD_LABEL[s]).toBeTruthy();
  });
  it("only STAND BY takes the caution override", () => {
    expect(DECK_STATES.filter((s) => DECK_FLAGS[s].caution)).toEqual(["stand_by"]);
  });
});
