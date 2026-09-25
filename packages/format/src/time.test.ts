import { describe, expect, test } from "bun:test";
import { formatExactTime, formatRelativeTime } from "./time";

const utc = { locale: "en-US", timeZone: "UTC" };
const now = new Date("2026-09-25T12:00:00Z");

function ago(milliseconds: number) {
  return new Date(now.getTime() - milliseconds);
}

describe("formatRelativeTime", () => {
  test.each([
    ["just now", ago(30_000), "now"],
    ["a clock that runs fast", ago(-5_000), "now"],
    ["one minute", ago(60_000), "1m"],
    ["minutes round down", ago(119_000), "1m"],
    ["59 minutes", ago(59 * 60_000), "59m"],
    ["hours", ago(3 * 3_600_000), "3h"],
    ["23 hours", ago(23 * 3_600_000 + 59 * 60_000), "23h"],
    ["a day or more: the date", ago(24 * 3_600_000), "Sep 24"],
    ["earlier this year", new Date("2026-01-02T10:00:00Z"), "Jan 2"],
    ["another year: with the year", new Date("2025-12-31T23:00:00Z"), "Dec 31, 2025"],
  ])("%s", (_, time, expected) => {
    expect(formatRelativeTime(time, now, utc)).toBe(expected);
  });

  test("the date and year are judged in the reader's time zone", () => {
    // 16:00 UTC on New Year's Eve is already 01:00 on January 1 in Tokyo.
    const time = new Date("2025-12-31T16:00:00Z");
    const later = new Date("2026-01-02T12:00:00Z");
    expect(formatRelativeTime(time, later, { locale: "en-US", timeZone: "UTC" })).toBe(
      "Dec 31, 2025",
    );
    expect(formatRelativeTime(time, later, { locale: "en-US", timeZone: "Asia/Tokyo" })).toBe(
      "Jan 1",
    );
  });

  test("uses the reader's language", () => {
    expect(formatRelativeTime(ago(10_000), now, { locale: "de-DE", timeZone: "UTC" })).toBe(
      "jetzt",
    );
  });
});

describe("formatExactTime", () => {
  test("date and time, for a tooltip", () => {
    // ICU versions differ in the space before "PM": a plain or a narrow no-break space.
    expect(formatExactTime(new Date("2026-09-12T14:03:00Z"), utc)).toMatch(
      /^Sep 12, 2026, 2:03\sPM$/,
    );
  });
});
