import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { SnapshotStore } from "../src/storage/snapshots.js";
import { preferencesSchema, type AccountQuota } from "../src/quota/types.js";
it("persists only schema-approved data and serializes simultaneous writes", async () => {
  const root = resolve(tmpdir()); const directory = await mkdtemp(join(root, "quota-dock-test-"));
  try {
    const store = new SnapshotStore(directory);
    const row: AccountQuota & { accessToken: string } = { accountRef: "opaque", alias: "Test", plan: null, status: "ready", windows: [], credits: null, source: "codex-app-server", lastAttemptAt: 1, lastSuccessAt: 1, errorCode: null, refreshing: false, revision: 1, accessToken: "must-not-persist" };
    await Promise.all([store.save([row], preferencesSchema.parse({})), store.save([row], preferencesSchema.parse({ sort: "remaining" }))]);
    const content = await readFile(join(directory, "state.json"), "utf8"); expect(content).not.toContain("must-not-persist"); expect(content).not.toContain("accessToken");
    expect((await store.load())?.preferences.sort).toBe("remaining");
  } finally { if (dirname(resolve(directory)) === root && directory.startsWith(join(root, "quota-dock-test-"))) await rm(directory, { recursive: true, force: true }); }
});
