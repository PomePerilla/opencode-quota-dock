import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import type { OAuthMaterial } from "../../accounts/directory.js";
import { QuotaError, type NormalizedQuota } from "../types.js";
import { normalizeRateLimits } from "../normalize.js";

export interface QuotaAdapter {
  available(): boolean;
  read(material: OAuthMaterial, signal: AbortSignal, refresh: () => Promise<OAuthMaterial>): Promise<NormalizedQuota>;
}

export function findCodex(override?: string): string | undefined {
  if (override) return isAbsolute(override) && existsSync(override) && !/\.(cmd|bat|ps1)$/i.test(override) ? override : undefined;
  const executable = process.platform === "win32" ? "codex.exe" : "codex";
  const candidates = (process.env.PATH ?? "").split(delimiter).map(directory => join(directory, executable));
  if (process.platform === "win32") {
    const npm = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "npm", "node_modules", "@openai", "codex");
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const triple = arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
    candidates.push(join(npm, "node_modules", "@openai", `codex-win32-${arch}`, "vendor", triple, "bin", executable));
    candidates.push(join(npm, "vendor", triple, "codex", executable));
  }
  return candidates.find(candidate => existsSync(candidate));
}

interface Pending { resolve(value: unknown): void; reject(error: unknown): void; dispose(): void; }

/** Minimal stdio protocol client. No raw child output or protocol errors enter logs/RPC. */
export class StdioRpc {
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private buffer = "";
  private closed = false;
  constructor(private readonly child: ChildProcessWithoutNullStreams,
    private readonly refresh: (params: unknown) => Promise<unknown>) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => this.receive(String(chunk)));
    // Drain stderr to avoid a blocked pipe. It can contain authentication context and is never retained.
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => this.fail(new QuotaError("bridge_failed")));
    child.on("error", () => this.fail(new QuotaError("bridge_unavailable")));
    child.on("exit", () => this.fail(new QuotaError("bridge_failed")));
  }
  notify(method: string, params?: unknown) { this.send({ method, ...(params === undefined ? {} : { params }) }); }
  request(method: string, params: unknown, signal: AbortSignal, timeoutMs = 25_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new QuotaError("bridge_failed"));
    if (signal.aborted) return Promise.reject(new QuotaError("cancelled"));
    const id = ++this.sequence;
    return new Promise((resolvePromise, reject) => {
      const finish = (error: unknown) => { const task = this.pending.get(id); if (!task) return; this.pending.delete(id); task.dispose(); reject(error); };
      const timer = setTimeout(() => finish(new QuotaError("timeout")), timeoutMs);
      const abort = () => finish(new QuotaError("cancelled"));
      const dispose = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
      this.pending.set(id, { resolve: resolvePromise, reject, dispose });
      signal.addEventListener("abort", abort, { once: true });
      try { this.send({ method, id, ...(params === undefined ? {} : { params }) }); }
      catch { finish(new QuotaError("bridge_failed")); }
    });
  }
  close() { this.fail(new QuotaError("cancelled")); this.child.stdin.end(); }
  private send(message: unknown) {
    if (this.closed || this.child.stdin.destroyed) throw new QuotaError("bridge_failed");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  private receive(chunk: string) {
    if (this.closed) return;
    this.buffer += chunk;
    if (this.buffer.length > 4_000_000) { this.fail(new QuotaError("invalid_response")); this.child.kill(); return; }
    let end: number;
    while ((end = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message: Record<string, unknown>;
      try { message = JSON.parse(line) as Record<string, unknown>; }
      catch { this.fail(new QuotaError("invalid_response")); this.child.kill(); return; }
      if (!message || typeof message !== "object") continue;
      if (typeof message.method === "string" && message.id !== undefined) {
        const id = message.id;
        if (message.method !== "account/chatgptAuthTokens/refresh") {
          try { this.send({ id, error: { code: -32601, message: "Unsupported server request" } }); } catch {}
          continue;
        }
        void this.refresh(message.params).then(result => {
          if (!this.closed) this.send({ id, result });
        }, () => { if (!this.closed) this.send({ id, error: { code: -32000, message: "Reauthentication required" } }); }).catch(() => {});
        continue;
      }
      if (typeof message.id !== "number") continue;
      const task = this.pending.get(message.id);
      if (!task) continue;
      this.pending.delete(message.id); task.dispose();
      if (message.error) {
        const error = message.error as { message?: unknown; code?: unknown };
        const description = typeof error.message === "string" ? error.message : "";
        const code = /401|unauthoriz|authentication|sign.?in/i.test(description) ? "reauth_required"
          : /429|rate.?limit|too many/i.test(description) ? "rate_limited"
          : /not supported|unknown variant|method not found|experimental/i.test(description) || error.code === -32601 ? "protocol_unsupported"
          : /network|connect|dns|fetch|timed out/i.test(description) ? "offline" : "bridge_failed";
        task.reject(new QuotaError(code, code === "rate_limited" ? 60_000 : 0));
      } else task.resolve(message.result);
    }
  }
  private fail(error: QuotaError) {
    if (this.closed) return;
    this.closed = true;
    for (const task of this.pending.values()) { task.dispose(); task.reject(error); }
    this.pending.clear();
    this.buffer = "";
  }
}

export class CodexAppServerAdapter implements QuotaAdapter {
  constructor(private readonly executable = findCodex()) {}
  available() { return this.executable !== undefined; }
  async read(material: OAuthMaterial, signal: AbortSignal, refresh: () => Promise<OAuthMaterial>): Promise<NormalizedQuota> {
    if (!this.executable) throw new QuotaError("bridge_unavailable");
    if (signal.aborted) throw new QuotaError("cancelled");
    const tempRoot = resolve(tmpdir());
    const directory = await mkdtemp(join(tempRoot, "quota-dock-"));
    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: directory };
    for (const name of ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_BASE_URL", "CODEX_SQLITE_HOME"]) delete env[name];
    const child = spawn(this.executable, ["app-server", "--listen", "stdio://", "-c", "analytics.enabled=false"], { cwd: directory, env, windowsHide: true, stdio: "pipe", shell: false });
    let current = material;
    let refreshCount = 0;
    const rpc = new StdioRpc(child, async params => {
      if (++refreshCount > 1) throw new QuotaError("reauth_required");
      const previous = params as { previousAccountId?: unknown } | undefined;
      if (previous?.previousAccountId && previous.previousAccountId !== current.accountId) throw new QuotaError("identity_changed");
      const next = await refresh();
      if (next.accountId !== material.accountId) throw new QuotaError("identity_changed");
      if (next.access === current.access) throw new QuotaError("reauth_required");
      current = next;
      return { accessToken: next.access, chatgptAccountId: next.accountId, ...(next.plan ? { chatgptPlanType: next.plan } : {}) };
    });
    const stop = () => { rpc.close(); child.kill(); };
    signal.addEventListener("abort", stop, { once: true });
    try {
      await rpc.request("initialize", { clientInfo: { name: "quota_dock", title: "Quota Dock", version: "0.1.6" }, capabilities: { experimentalApi: true } }, signal);
      rpc.notify("initialized");
      await rpc.request("account/login/start", { type: "chatgptAuthTokens", accessToken: material.access, chatgptAccountId: material.accountId, ...(material.plan ? { chatgptPlanType: material.plan } : {}) }, signal);
      const result = await rpc.request("account/rateLimits/read", undefined, signal);
      const reportedAccount = (result as { accountId?: unknown } | null)?.accountId;
      if (reportedAccount != null && reportedAccount !== material.accountId) throw new QuotaError("identity_changed");
      return normalizeRateLimits(result);
    } finally {
      signal.removeEventListener("abort", stop);
      rpc.close();
      if (child.exitCode === null) {
        child.kill();
        await new Promise<void>(done => { const timer = setTimeout(done, 2_000); child.once("exit", () => { clearTimeout(timer); done(); }); });
      }
      // Validate the resolved target before recursive removal on Windows.
      if (dirname(resolve(directory)) === tempRoot && directory.startsWith(join(tempRoot, "quota-dock-"))) {
        await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
      }
    }
  }
}
