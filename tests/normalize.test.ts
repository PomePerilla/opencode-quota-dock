import { describe, expect, it } from "vitest";
import { normalizeRateLimits } from "../src/quota/normalize.js";
import { accountRef, makeDirectory, oauthMaterial } from "../src/accounts/directory.js";
import { countdown } from "../src/gui/format.js";
describe("quota semantics", () => {
  it("prefers multiple buckets, converts seconds, and uses actual window lengths", () => {
    const result = normalizeRateLimits({ rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: { codex: { primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1_800_000_000 } }, other: { limitName: "Review", secondary: { usedPercent: 10, windowDurationMins: 60, resetsAt: 1_800_000_100 } } } });
    expect(result.windows.map(w => [w.label, w.remainingPercent])).toEqual([["5 小时", 72], ["1 小时", 90]]);
    expect(result.windows[0]?.resetsAt).toBe(1_800_000_000_000);
  });
  it("does not turn missing or malformed readings into full or empty quotas", () => {
    expect(normalizeRateLimits({ rateLimits: { primary: null, secondary: null } }).windows).toEqual([]);
    const result = normalizeRateLimits({ rateLimits: { primary: { usedPercent: 101, resetsAt: 1_800_000_000_000 }, secondary: { usedPercent: "10" } } });
    expect(result.windows.map(w => w.remainingPercent)).toEqual([null, null]);
    expect(result.windows[0]?.resetsAt).toBeNull();
    expect(() => normalizeRateLimits({ error: "no data" })).toThrow("invalid_response");
  });
  it("keeps credits separate, with no arbitrary response text", () => {
    const result = normalizeRateLimits({ rateLimits: { credits: { balance: "14.25", unlimited: false } } });
    expect(result.credits?.balance).toBe("14.25"); expect(result.windows).toEqual([]);
    expect(normalizeRateLimits({ rateLimits: { credits: { balance: "Bearer secret" } } }).credits?.balance).toBeNull();
  });
  it("waits for a read after the reset instead of replenishing a percentage", () => { expect(countdown(100, 200)).toContain("等待同步"); });
});
describe("account ownership", () => {
  it("uses opaque stable credential refs and keeps distinct accounts", () => {
    const one = { type: "credential" as const, method: "oauth" as const, id: "one", label: "Shared name" };
    expect(makeDirectory([one, one, { ...one, id: "two" }])).toHaveLength(2);
    expect(accountRef("one")).not.toContain("one"); expect(accountRef("one")).not.toEqual(accountRef("two"));
  });
  it("requires host-owned identity metadata and refuses external/key auth", () => {
    expect(() => oauthMaterial({ type: "oauth", access: "a-long-jwt-token", metadata: { email: "a@b.com" } })).toThrow("missing_account_identity");
    expect(() => oauthMaterial({ type: "external" })).toThrow("reauth_required");
    expect(oauthMaterial({ type: "oauth", access: "test-token", metadata: { accountID: "workspace-1" } }).accountId).toBe("workspace-1");
  });
  it("does not mislabel SIWC credentials as expired", () => {
    expect(() => oauthMaterial({ type: "oauth", access: "test-token", metadata: { clientID: "registered-client", scopes: [] } })).toThrow("siwc_quota_unavailable");
  });
});
