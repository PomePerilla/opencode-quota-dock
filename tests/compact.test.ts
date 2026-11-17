import { describe, expect, it } from "vitest";
import { compactCountdown, compactTone, periodWindows } from "../src/gui/compact.js";
import type { AccountQuota, QuotaWindow } from "../src/quota/types.js";
const window = (key: string, remaining: number, reset: number | null): QuotaWindow => ({ key, bucket: "codex", label: key, durationMinutes: 300, usedPercent: 100 - remaining, remainingPercent: remaining, resetsAt: reset, state: "known" });
describe("compact account readout", () => {
  it("shows hours and minutes without prose", () => {
    expect(compactCountdown(92 * 60_000, 0)).toBe("1h32m");
    expect(compactCountdown(60 * 60_000, 0)).toBe("1h");
    expect(compactCountdown(2 * 86_400_000 + 3_600_000, 0)).toBe("2d1h");
    expect(compactCountdown(null, 0)).toBe("—");
  });
  it("keeps the five-hour and weekly windows in independent slots regardless of order", () => {
    const week = { ...window("weekly", 90, 5_000), durationMinutes: 10_080 };
    const hour = window("5h", 23, 1_000);
    expect(periodWindows([week, hour])).toEqual({ fiveHour: hour, weekly: week });
    expect(periodWindows([week])).toEqual({ fiveHour: undefined, weekly: week });
    expect(periodWindows([{ ...hour, durationMinutes: 15 }])).toEqual({ fiveHour: undefined, weekly: undefined });
    expect(periodWindows([])).toEqual({ fiveHour: undefined, weekly: undefined });
  });
  it("does not replenish an expired window or fabricate an unknown countdown", () => {
    const expired = window("5h", 6, 1_000);
    expect(compactCountdown(expired.resetsAt, 2_000)).toBe("0m");
    expect(expired.remainingPercent).toBe(6);
    expect(compactTone({ status: "ready" } as AccountQuota, expired, 2_000)).toBe("stale");
  });
});
