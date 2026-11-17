import { Plugin } from "@opencode/plugin";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { QuotaDock } from "./rpc.js";
import { Coordinator } from "./refresh/coordinator.js";
import { CodexAppServerAdapter } from "./quota/adapters/codex-app-server.js";
import { SnapshotStore } from "./storage/snapshots.js";
import { accountRef, type Connection } from "./accounts/directory.js";

type Shared = { coordinator: Coordinator; ready: Promise<void>; references: number; stopping?: Promise<void> };
const key = Symbol.for("quota-dock.coordinators.v1");
const globalState = globalThis as typeof globalThis & { [key]?: Map<string, Shared> };
const instances = globalState[key] ??= new Map<string, Shared>();

export default Plugin.define({
  id: "quota-dock",
  async setup(ctx) {
    const codexPath = typeof ctx.options.codexPath === "string" ? ctx.options.codexPath : undefined;
    // Process-local sharing covers every location/window of this OpenCode service.
    const revision = typeof ctx.options.buildRevision === "string" ? ctx.options.buildRevision : "installed";
    const instanceKey = `${process.pid}:${process.env.OPENCODE_DB ?? "default"}:${codexPath ?? "auto"}:${revision}`;
    let shared = instances.get(instanceKey);
    if (shared?.stopping) { await shared.stopping; shared = undefined; }
    const host = {
      async list() {
        const { data: integration } = await ctx.integration.get({ integrationID: "openai" });
        return (integration?.connections ?? []).filter((item): item is Connection => item.type === "credential" && item.method === "oauth");
      },
      resolve: (connection: Connection) => ctx.integration.connection.resolve(connection),
    };
    let detach: () => void;
    if (!shared) {
      const scope = createHash("sha256").update(process.env.OPENCODE_DB ?? "default").digest("hex").slice(0, 12);
      const coordinator = new Coordinator(new CodexAppServerAdapter(codexPath), new SnapshotStore(join(homedir(), ".local", "state", "opencode-quota-dock", scope)));
      detach = coordinator.attach(host);
      shared = { coordinator, references: 0, ready: coordinator.start() };
      instances.set(instanceKey, shared);
    } else detach = shared.coordinator.attach(host);
    const lease = shared;
    lease.references++;
    let registration: Awaited<ReturnType<typeof ctx.rpc.register<typeof QuotaDock>>>;
    let unsubscribe = () => {};
    const eventAbort = new AbortController();
    try {
      await lease.ready;
      registration = await ctx.rpc.register(QuotaDock, {
        diagnostics: async () => ({ activeAccountRef: await ctx.integration.connection.active("openai").then(active => active?.type === "credential" ? accountRef(active.id) : null), accounts: await Promise.all((await host.list()).map(async connection => {
          const raw = await host.resolve(connection).catch(() => undefined);
          let authClaimKeys: string[] = [];
          if (raw?.type === "oauth") {
            try { const claims = JSON.parse(Buffer.from(raw.access.split(".")[1] ?? "", "base64url").toString("utf8")); authClaimKeys = Object.keys(claims["https://api.openai.com/auth"] ?? {}).filter(key => key.length < 80).slice(0, 30); } catch {}
          }
          return { accountRef: accountRef(connection.id), kind: raw?.type ?? "unavailable", metadataKeys: Object.keys(raw?.metadata ?? {}).filter(key => key.length < 80).slice(0, 30), authClaimKeys };
        })) }),
        snapshot: async () => { await lease.coordinator.syncDirectory(); return lease.coordinator.snapshot(); },
        refresh: async input => lease.coordinator.refresh(input.accountRef),
        preferences: async input => lease.coordinator.preference(input),
        visibility: async input => { lease.coordinator.visibility(input.clientId, input.visible); return { ok: true }; },
      });
      unsubscribe = lease.coordinator.onUpdate(() => { void registration.events.emit("updated", { revision: lease.coordinator.snapshot().revision }).catch(() => {}); });
      void (async () => {
        try {
          for await (const event of ctx.event.subscribe({ types: ["credential.updated", "integration.updated"], signal: eventAbort.signal })) {
            if (event.type === "credential.updated") { if (event.data.integrationID === "openai") lease.coordinator.credentialsChanged(event.data.credentialID); }
            else lease.coordinator.credentialsChanged();
          }
        } catch { /* Directory polling remains available if the live event stream disconnects. */ }
      })();
    } catch (error) {
      detach(); if (--lease.references === 0) { instances.delete(instanceKey); await lease.coordinator.stop(); }
      throw error;
    }
    return async () => {
      eventAbort.abort(); unsubscribe(); detach(); await registration.dispose();
      if (--lease.references === 0) {
        lease.stopping = lease.coordinator.stop(); await lease.stopping;
        if (instances.get(instanceKey) === lease) instances.delete(instanceKey);
      }
    };
  },
});
