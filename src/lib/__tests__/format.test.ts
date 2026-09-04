import { describe, expect, it } from "vitest";
import {
  endOfDay, eveningBefore, logDate, logDateTime, logDateYear, logMeta, logTime,
  price, roman, startOfDay, wallClockInZone, yearIn,
} from "@/lib/format";
import { CLUB_ZONE } from "@/lib/brand";

/* 03:00Z on Jan 1 is still Dec 31 in every American harbour. Every date test
   below sits on a midnight or a year boundary on purpose: the render machine's
   zone is the defect this module exists to make impossible, and a test that
   passes in the middle of an afternoon proves nothing about it. */
const NEW_YEAR_UTC = "2026-01-01T03:00:00Z";

describe("logDate", () => {
  it("dates the instant on the stated clock, not the machine's", () => {
    expect(logDate(NEW_YEAR_UTC, "America/Los_Angeles")).toBe("DEC 31");
    expect(logDate(NEW_YEAR_UTC, "UTC")).toBe("JAN 01");
  });
  it("a null zone means the club's own, never the render machine", () => {
    expect(logDate(NEW_YEAR_UTC, null)).toBe(logDate(NEW_YEAR_UTC, CLUB_ZONE));
    expect(logDate(NEW_YEAR_UTC, null)).toBe("DEC 31");
  });
  it("pads the day", () => {
    expect(logDate("2026-07-06T12:00:00Z", "UTC")).toBe("JUL 06");
  });
});

describe("yearIn / logDateYear", () => {
  it("a member who joined at 22:00 Pacific on Dec 31 joined that year", () => {
    expect(yearIn(NEW_YEAR_UTC, "America/Los_Angeles")).toBe(2025);
    expect(yearIn(NEW_YEAR_UTC, "UTC")).toBe(2026);
  });
  it("carries the year and never the word undefined", () => {
    const s = logDateYear(NEW_YEAR_UTC, "America/Los_Angeles");
    expect(s).toBe("DEC 31 · 2025");
    expect(s).not.toMatch(/undefined|NaN|null/);
  });
});

describe("logTime", () => {
  it("midnight is 00:00, never 24:00", () => {
    /* 07:00Z is 00:00 in Los Angeles under daylight time. */
    expect(logTime("2026-07-26T07:00:00Z", "America/Los_Angeles")).toBe("00:00");
    expect(logTime("2026-07-26T04:00:00Z", "America/New_York")).toBe("00:00");
  });
  it("is on the stated clock", () => {
    expect(logTime("2026-07-26T13:05:00Z", "America/New_York")).toBe("09:05");
    expect(logTime("2026-07-26T13:05:00Z", "UTC")).toBe("13:05");
  });
  it("composes into the ship's-log line", () => {
    expect(logDateTime("2026-07-26T13:05:00Z", "America/New_York")).toBe("JUL 26 · 09:05");
    expect(logMeta("2026-07-26T13:05:00Z", 26, "America/New_York")).toEqual(["JUL 26", "09:05", "26 NM"]);
    expect(logMeta("2026-07-26T13:05:00Z", null, "America/New_York")).toEqual(["JUL 26", "09:05"]);
    expect(logMeta("2026-07-26T13:05:00Z", undefined, "America/New_York")).toHaveLength(2);
    /* Zero nautical miles is a distance, not an absence. */
    expect(logMeta("2026-07-26T13:05:00Z", 0, "America/New_York")).toEqual(["JUL 26", "09:05", "0 NM"]);
  });
});

describe("price", () => {
  it("reads nothing as complimentary, never as $0", () => {
    expect(price(0)).toBe("COMPLIMENTARY");
  });
  it("drops the cents only when there are none", () => {
    expect(price(12000)).toBe("$120");
    expect(price(56169)).toBe("$561.69");
    expect(price(5)).toBe("$0.05");
    expect(price(10050)).toBe("$100.50");
  });
  it("groups the Bridge's five-figure totals", () => {
    expect(price(1_000_000)).toBe("$10,000");
    expect(price(123_456_789)).toBe("$1,234,567.89");
  });
});

describe("roman", () => {
  it("sets the subtractive forms", () => {
    const cases: Array<[number, string]> = [
      [1, "I"], [4, "IV"], [9, "IX"], [14, "XIV"], [40, "XL"], [90, "XC"],
      [400, "CD"], [900, "CM"], [1994, "MCMXCIV"], [2026, "MMXXVI"], [3999, "MMMCMXCIX"],
    ];
    for (const [n, s] of cases) expect(roman(n)).toBe(s);
  });
  it("has nothing to say about zero", () => {
    expect(roman(0)).toBe("");
  });
});

describe("wallClockInZone", () => {
  it("18:00 on a Pacific wall is 01:00Z the next day in summer", () => {
    expect(wallClockInZone(2026, 7, 26, 18, 0, "America/Los_Angeles")).toBe(Date.UTC(2026, 6, 27, 1, 0));
  });
  it("and 02:00Z in winter — the offset is read, not assumed", () => {
    expect(wallClockInZone(2026, 1, 15, 18, 0, "America/Los_Angeles")).toBe(Date.UTC(2026, 0, 16, 2, 0));
    expect(wallClockInZone(2026, 1, 15, 18, 0, "America/New_York")).toBe(Date.UTC(2026, 0, 15, 23, 0));
  });
  it("a null zone is the club's clock", () => {
    expect(wallClockInZone(2026, 1, 15, 18, 0, null)).toBe(wallClockInZone(2026, 1, 15, 18, 0, CLUB_ZONE));
  });
  it("round-trips a wall time through the zone either side of a DST change", () => {
    const fmt = (zone: string) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
    for (const zone of ["America/New_York", "America/Los_Angeles", "America/Chicago", "Europe/London"]) {
      /* The day before and the day after the 2026 spring-forward and fall-back
         in the US, and a plain summer day. 18:00 exists on all of them. */
      for (const [y, m, d] of [[2026, 3, 7], [2026, 3, 9], [2026, 10, 31], [2026, 11, 2], [2026, 7, 4]]) {
        const t = wallClockInZone(y, m, d, 18, 0, zone);
        const parts = Object.fromEntries(fmt(zone).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
        expect([Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour) % 24, Number(parts.minute)])
          .toEqual([y, m, d, 18, 0]);
      }
    }
  });
});

describe("eveningBefore", () => {
  it("is 18:00 the day before departure, on the harbour's wall", () => {
    /* Departs 2026-07-26 at noon Pacific (19:00Z). The night before is
       2026-07-25 18:00 PDT, which is 2026-07-26T01:00Z. */
    expect(eveningBefore("2026-07-26T19:00:00Z", "America/Los_Angeles")).toBe(Date.UTC(2026, 6, 26, 1, 0));
  });
  it("reads the departure DAY on the harbour's clock, not UTC's", () => {
    /* 03:00Z on the 27th is still the evening of the 26th in Los Angeles, so
       the night before is the 25th. A UTC reading would say the 26th. */
    expect(eveningBefore("2026-07-27T03:00:00Z", "America/Los_Angeles")).toBe(Date.UTC(2026, 6, 26, 1, 0));
  });
  it("takes a different hour", () => {
    expect(eveningBefore("2026-07-26T19:00:00Z", "America/Los_Angeles", 12)).toBe(Date.UTC(2026, 6, 25, 19, 0));
  });
});

describe("startOfDay / endOfDay", () => {
  it("a deadline named by a day means the END of it in the zone", () => {
    expect(endOfDay("2026-09-01", "America/New_York")).toBe("2026-09-02T04:00:00.000Z");
    expect(startOfDay("2026-09-01", "America/New_York")).toBe("2026-09-01T04:00:00.000Z");
  });
  it("a range named by two dates covers both of them entirely", () => {
    const from = startOfDay("2026-09-01", CLUB_ZONE);
    const to = endOfDay("2026-09-01", CLUB_ZONE);
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 60 * 60 * 1000);
  });
  it("crosses a month and a year", () => {
    expect(endOfDay("2026-12-31", "UTC")).toBe("2027-01-01T00:00:00.000Z");
    expect(endOfDay("2026-02-28", "UTC")).toBe("2026-03-01T00:00:00.000Z");
  });
  it("reads only the date off a full timestamp", () => {
    expect(endOfDay("2026-09-01T23:59:00Z", "UTC")).toBe("2026-09-02T00:00:00.000Z");
  });
});
