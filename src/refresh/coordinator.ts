import { createHash } from "node:crypto";
import { makeDirectory, oauthMaterial, type HostAccounts, type MonitoredAccount } from "../accounts/directory.js";
import type { QuotaAdapter } from "../quota/adapters/codex-app-server.js";
import { preferencesSchema, safeError, type AccountPreference, type AccountQuota, type Preferences, type Snapshot } from "../quota/types.js";
import type { SnapshotStore } from "../storage/snapshots.js";
import { resolveCredential } from "../accounts/resolve.js";

type Entry = { identity: MonitoredAccount; row: AccountQuota; controller?: AbortController; nextAt: number; failures: number; fingerprint?: string; resetSeen?: number; blocked?: boolean; };

export class Coordinator {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private visible = new Map<string, number>();
  private pending = new Map<string, Promise<void>>();
  private hosts = new Map<symbol, HostAccounts>();
  private queue: (() => void)[] = [];
  private active = 0;
  private timer?: ReturnType<typeof setInterval>;
  private directoryPending?: Promise<void>;
  private directoryCheckedAt = -Infinity;
  private stopped = false;
  private revision = 0;
  private directoryError = false;
  private prefs: Preferences = preferencesSchema.parse({});
  private nextPersistence?: ReturnType<typeof setTimeout>;
  constructor(private readonly adapter: QuotaAdapter, private readonly store?: SnapshotStore,
    private readonly now = () => Date.now()) {}

  attach(host: HostAccounts): () => void { const key = Symbol(); this.hosts.set(key, host); return () => this.hosts.delete(key); }
  private host() { return [...this.hosts.values()].at(-1); }
  async start() {
    const cached = await this.store?.load();
    if (cached) this.prefs = cached.preferences;
    // Do not resurrect another identity's old quota before authenticating that connection.
    await this.syncDirectory();
    this.timer = setInterval(() => void this.tick(), 5_000); this.timer.unref?.();
  }
  onUpdate(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  snapshot(): Snapshot {
    const now = this.now();
    return { accounts: [...this.entries.values()].map(({ row }) => ({ ...row, windows: row.windows.map(w => ({ ...w })), status: row.status === "ready" && row.lastSuccessAt !== null && now - row.lastSuccessAt > 120_000 ? "stale" : row.status })),
      preferences: structuredClone(this.prefs), revision: this.revision, generatedAt: now,
      bridgeAvailable: this.adapter.available(), directoryError: this.directoryError };
  }
  async refresh(ref?: string): Promise<Snapshot> {
    await this.syncDirectory();
    const entries = ref ? [this.entries.get(ref)].filter((x): x is Entry => !!x) : [...this.entries.values()];
    await Promise.all(entries.filter(entry => this.monitored(entry)).map(entry => this.request(entry, true)));
    return this.snapshot();
  }
  preference(input: { accountRef?: string; account?: AccountPreference; sort?: "name" | "remaining" }): Snapshot {
    if (input.sort) this.prefs.sort = input.sort;
    if (input.accountRef && input.account && this.entries.has(input.accountRef)) {
      this.prefs.accounts[input.accountRef] = { ...this.prefs.accounts[input.accountRef], ...input.account };
      const entry = this.entries.get(input.accountRef)!;
      entry.row.alias = this.prefs.accounts[input.accountRef]?.alias || entry.identity.connection.label;
      if (!this.monitored(entry)) entry.controller?.abort();
      else entry.nextAt = this.now();
    }
    this.changed(); return this.snapshot();
  }
  visibility(clientId: string, visible: boolean) {
    if (visible) this.visible.set(clientId, this.now() + 45_000); else this.visible.delete(clientId);
    if (visible) void this.tick();
  }
  async syncDirectory(): Promise<void> {
    if (this.directoryPending) return this.directoryPending;
    if (this.now() - this.directoryCheckedAt < 5_000) return;
    this.directoryPending = (async () => {
      const host = this.host(); if (!host || this.stopped) return;
      try {
        const directory = makeDirectory(await host.list());
        if (this.stopped) return;
        const refs = new Set(directory.map(item => item.ref));
        for (const [ref, entry] of this.entries) if (!refs.has(ref)) { entry.controller?.abort(); this.entries.delete(ref); }
        for (const identity of directory) {
          const existing = this.entries.get(identity.ref);
          const alias = this.prefs.accounts[identity.ref]?.alias || identity.connection.label;
          if (existing) { existing.identity = identity; existing.row.alias = alias; continue; }
          this.entries.set(identity.ref, { identity, failures: 0, nextAt: this.now(), row: {
            accountRef: identity.ref, alias, plan: null, status: this.adapter.available() ? "loading" : "unsupported",
            windows: [], credits: null, source: "codex-app-server", lastAttemptAt: null, lastSuccessAt: null,
            errorCode: this.adapter.available() ? null : "bridge_unavailable", refreshing: false, revision: this.revision,
          } });
        }
        this.directoryError = false; this.directoryCheckedAt = this.now(); this.changed();
      } catch { this.directoryError = true; this.directoryCheckedAt = this.now(); this.changed(); }
    })().finally(() => { this.directoryPending = undefined; });
    return this.directoryPending;
  }
  credentialsChanged(id?: string) {
    this.directoryCheckedAt = -Infinity;
    for (const entry of this.entries.values()) if (!id || entry.identity.connection.id === id) {
      entry.blocked = false; entry.failures = 0; entry.nextAt = this.now();
    }
    void this.tick();
  }
  async tick() {
    if (this.stopped) return;
    const now = this.now();
    for (const [id, expires] of this.visible) if (expires < now) this.visible.delete(id);
    if (now - this.directoryCheckedAt > 30_000) await this.syncDirectory();
    if (this.visible.size === 0) return; // Monitoring pauses when no live panel is visible.
    for (const entry of this.entries.values()) {
      const reset = entry.row.windows.map(window => window.resetsAt).filter((value): value is number => value !== null && value <= now).sort((a, b) => b - a)[0];
      if (reset !== undefined && entry.resetSeen !== reset) { entry.resetSeen = reset; entry.nextAt = Math.min(entry.nextAt, now); }
      if (this.monitored(entry) && entry.nextAt <= now) void this.request(entry, false);
    }
  }
  async stop() {
    this.stopped = true; if (this.timer) clearInterval(this.timer); if (this.nextPersistence) clearTimeout(this.nextPersistence);
    for (const entry of this.entries.values()) entry.controller?.abort();
    // Queued jobs wake and see cancellation, releasing their semaphore slots.
    await Promise.allSettled(this.pending.values());
    await this.store?.save(this.snapshot().accounts, this.prefs).catch(() => {});
    this.listeners.clear(); this.visible.clear(); this.hosts.clear();
  }
  private monitored(entry: Entry) { return this.prefs.accounts[entry.identity.ref]?.monitored !== false; }
  private request(entry: Entry, manual: boolean): Promise<void> {
    const ref = entry.identity.ref;
    const pending = this.pending.get(ref); if (pending) return pending;
    if (this.stopped || !this.adapter.available() || !this.monitored(entry) || (!manual && entry.blocked)) return Promise.resolve();
    const now = this.now();
    // Manual refresh can bypass the cache but never the failure backoff or 15s minimum spacing.
    if (entry.row.lastAttemptAt !== null && (now - entry.row.lastAttemptAt < 15_000 || (entry.failures > 0 && !entry.blocked && now < entry.nextAt))) return Promise.resolve();
    if (!manual && now < entry.nextAt) return Promise.resolve();
    const controller = new AbortController(); entry.controller = controller;
    const task = this.run(entry, controller.signal).finally(() => { if (this.pending.get(ref) === task) this.pending.delete(ref); if (entry.controller === controller) entry.controller = undefined; });
    this.pending.set(ref, task); return task;
  }
  private async run(entry: Entry, signal: AbortSignal) {
    await this.acquire();
    try {
      if (signal.aborted || this.stopped || this.entries.get(entry.identity.ref) !== entry) return;
      entry.row.refreshing = true; entry.row.lastAttemptAt = this.now(); this.changed();
      const host = this.host(); if (!host) return;
      const material = oauthMaterial(await resolveCredential(host, entry.identity.connection, signal));
      const fingerprint = createHash("sha256").update(material.accountId).digest("hex");
      if (entry.fingerprint && entry.fingerprint !== fingerprint) { entry.row.windows = []; entry.row.credits = null; entry.row.lastSuccessAt = null; }
      entry.fingerprint = fingerprint;
      const quota = await this.adapter.read(material, signal, async () => oauthMaterial(await resolveCredential(this.host() ?? host, entry.identity.connection, signal)));
      if (signal.aborted || this.stopped || this.entries.get(entry.identity.ref) !== entry) return;
      Object.assign(entry.row, quota, { plan: quota.plan ?? material.plan, status: "ready", errorCode: null, lastSuccessAt: this.now() });
      entry.failures = 0; entry.blocked = false; entry.nextAt = this.now() + 60_000 + Math.floor(Math.random() * 3_000);
    } catch (error) {
      if (signal.aborted || this.stopped || this.entries.get(entry.identity.ref) !== entry) return;
      const safe = safeError(error);
      const reauth = ["reauth_required", "missing_account_identity", "identity_changed"].includes(safe.code);
      entry.row.status = reauth ? "reauth_required" : ["protocol_unsupported", "bridge_unavailable", "siwc_quota_unavailable"].includes(safe.code) ? "unsupported" : safe.code === "offline" || safe.code === "timeout" ? "offline" : entry.row.lastSuccessAt ? "stale" : "error";
      entry.blocked = reauth || entry.row.status === "unsupported";
      entry.row.errorCode = safe.code;
      if (safe.code === "identity_changed") { entry.row.windows = []; entry.row.credits = null; entry.row.lastSuccessAt = null; }
      entry.failures++;
      entry.nextAt = this.now() + Math.max(safe.retryAfterMs, reauth ? 300_000 : Math.min(300_000, 15_000 * 2 ** Math.min(entry.failures, 5)));
    } finally {
      entry.row.refreshing = false; entry.row.revision = ++this.revision;
      this.release(); if (!this.stopped) this.changed();
    }
  }
  private acquire(): Promise<void> {
    if (this.active < 2) { this.active++; return Promise.resolve(); }
    return new Promise(resolve => this.queue.push(resolve));
  }
  private release() { const next = this.queue.shift(); if (next) next(); else this.active--; }
  private changed() {
    this.revision++;
    for (const listener of this.listeners) { try { listener(); } catch { /* A disconnected GUI cannot stop monitoring. */ } }
    if (this.store && !this.nextPersistence && !this.stopped) {
      this.nextPersistence = setTimeout(() => { this.nextPersistence = undefined; void this.store!.save(this.snapshot().accounts, this.prefs).catch(() => {}); }, 500);
      this.nextPersistence.unref?.();
    }
  }
}
