import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { accountSchema, preferencesSchema, type AccountQuota, type Preferences } from "../quota/types.js";
const schema = z.object({ version: z.literal(1), accounts: z.array(accountSchema).max(10), preferences: preferencesSchema });

export class SnapshotStore {
  private queue = Promise.resolve();
  constructor(private readonly directory: string) {}
  async load(): Promise<{ accounts: AccountQuota[]; preferences: Preferences } | undefined> {
    try {
      const content = await readFile(join(this.directory, "state.json"), "utf8");
      if (content.length > 1_000_000) return;
      const parsed = schema.safeParse(JSON.parse(content));
      if (parsed.success) return parsed.data;
    } catch { /* A missing/corrupt cache must not prevent monitoring. */ }
  }
  save(accounts: AccountQuota[], preferences: Preferences): Promise<void> {
    // Parse/strip unknown properties at the persistence boundary, excluding any credential material.
    const payload = JSON.stringify(schema.parse({ version: 1, accounts, preferences }));
    this.queue = this.queue.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = join(this.directory, `state-${process.pid}.tmp`);
      await writeFile(temporary, payload, { mode: 0o600 });
      await rename(temporary, join(this.directory, "state.json"));
    });
    return this.queue;
  }
}
