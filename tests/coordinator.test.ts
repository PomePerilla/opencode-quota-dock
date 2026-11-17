import { afterEach, describe, expect, it } from "vitest";
import { Coordinator } from "../src/refresh/coordinator.js";
import { accountRef, type Connection } from "../src/accounts/directory.js";
import { QuotaError, type NormalizedQuota } from "../src/quota/types.js";
const fixtures = (count = 2): Connection[] => Array.from({ length: count }, (_, i) => ({ type: "credential", id: `credential-${i}`, method: "oauth", label: `Account ${i}` }));
const normalized = (remaining = 50): NormalizedQuota => ({ windows: [{ key: "codex:primary", bucket: "codex", label: "5 小时", durationMinutes: 300, usedPercent: 100 - remaining, remainingPercent: remaining, resetsAt: null, state: "known" }], credits: null, plan: "plus" });
const instances: Coordinator[] = [];
afterEach(async () => { await Promise.all(instances.splice(0).map(instance => instance.stop())); });
async function setup(read: (id: string, signal: AbortSignal) => Promise<NormalizedQuota>, count = 2) {
  let clock = 10_000; let connections = fixtures(count);
  const instance = new Coordinator({ available: () => true, read: (material, signal) => read(material.accountId, signal) }, undefined, () => clock);
  instance.attach({ list: async () => connections, resolve: async c => ({ type: "oauth", access: "credential-never-in-output", metadata: { accountID: c.id } }) });
  instances.push(instance); await instance.start();
  return { instance, advance: (ms: number) => clock += ms, remove: () => { connections = []; } };
}
describe("refresh coordination", () => {
  it("deduplicates simultaneous callers and limits concurrency to two", async () => {
    let calls = 0, active = 0, peak = 0;
    const { instance } = await setup(async () => { calls++; peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 10)); active--; return normalized(); }, 5);
    await Promise.all([instance.refresh(), instance.refresh(), instance.refresh()]);
    expect(calls).toBe(5); expect(peak).toBe(2);
    expect(JSON.stringify(instance.snapshot())).not.toContain("credential-never-in-output");
  });
  it("retains last good readings on a failed refresh and respects retry backoff", async () => {
    let calls = 0;
    const { instance, advance } = await setup(async () => { if (++calls > 1) throw new QuotaError("rate_limited", 120_000); return normalized(13); }, 1);
    await instance.refresh(); advance(20_000); await instance.refresh();
    expect(instance.snapshot().accounts[0]?.status).toBe("stale"); expect(instance.snapshot().accounts[0]?.windows[0]?.remainingPercent).toBe(13);
    await instance.refresh(); expect(calls).toBe(2); advance(121_000); await instance.refresh(); expect(calls).toBe(3);
  });
  it("isolates an account failure from the other account", async () => {
    const { instance } = await setup(async id => { if (id.endsWith("0")) throw new QuotaError("reauth_required"); return normalized(72); });
    await instance.refresh(); expect(instance.snapshot().accounts.map(account => account.status)).toEqual(["reauth_required", "ready"]);
  });
  it("does not let a removed account's in-flight result resurrect it", async () => {
    let finish: () => void = () => {};
    const { instance, remove, advance } = await setup(async () => { await new Promise<void>(resolve => finish = resolve); return normalized(); }, 1);
    const work = instance.refresh(); await new Promise(resolve => setTimeout(resolve, 0));
    remove(); advance(6_000); await instance.syncDirectory(); finish(); await work;
    expect(instance.snapshot().accounts).toEqual([]);
  });
  it("pauses unmonitored accounts and all polling without a visible panel", async () => {
    let calls = 0; const { instance } = await setup(async () => { calls++; return normalized(); });
    await instance.tick(); expect(calls).toBe(0);
    instance.preference({ accountRef: accountRef("credential-0"), account: { monitored: false } });
    await instance.refresh(); expect(calls).toBe(1);
  });
  it("uses directory throttling to avoid a snapshot-event feedback loop", async () => {
    const { instance } = await setup(async () => normalized());
    let updates = 0; instance.onUpdate(() => updates++);
    await instance.syncDirectory(); await instance.syncDirectory(); expect(updates).toBe(0);
  });
  it("can stop while the host's credential resolver is still pending", async () => {
    const instance = new Coordinator({ available: () => true, read: async () => normalized() });
    instance.attach({ list: async () => fixtures(1), resolve: async () => new Promise(() => {}) });
    instances.push(instance); await instance.start();
    const work = instance.refresh(); await new Promise(resolve => setTimeout(resolve, 0));
    await instance.stop(); await work; expect(instance.snapshot().accounts[0]?.refreshing).toBe(false);
  });
});
