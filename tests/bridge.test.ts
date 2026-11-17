import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StdioRpc } from "../src/quota/adapters/codex-app-server.js";
const children: ChildProcessWithoutNullStreams[] = [];
afterEach(() => { for (const child of children.splice(0)) child.kill(); });
function setup(refresh: (params: unknown) => Promise<unknown> = async () => ({})) {
  const child = spawn(process.execPath, [resolve("tests/fixtures/app-server.mjs")], { stdio: "pipe", windowsHide: true }); children.push(child);
  return new StdioRpc(child, refresh);
}
describe("stdio bridge", () => {
  it("handles split JSON frames without losing request identity", async () => {
    const rpc = setup(); const signal = AbortSignal.timeout(3000);
    await expect(rpc.request("initialize", {}, signal)).resolves.toEqual({ accepted: "initialize" }); rpc.close();
  });
  it("answers a host token-refresh request without exposing errors", async () => {
    let calls = 0; const rpc = setup(async () => { calls++; return { accessToken: "private-access-token" }; });
    await expect(rpc.request("refresh", {}, AbortSignal.timeout(3000))).resolves.toEqual({ refreshed: true }); expect(calls).toBe(1); rpc.close();
  });
  it("redacts backend error text", async () => {
    const rpc = setup(); let caught: unknown;
    try { await rpc.request("sensitive-error", {}, AbortSignal.timeout(3000)); } catch (error) { caught = error; }
    expect(String(caught)).toContain("reauth_required"); expect(String(caught)).not.toContain("test-sensitive-token"); rpc.close();
  });
  it("cancels outstanding reads and rejects malformed protocol data", async () => {
    const rpc = setup(); const abort = new AbortController(); const request = rpc.request("ignore", {}, abort.signal); abort.abort();
    await expect(request).rejects.toThrow("cancelled"); rpc.close();
    const other = setup(); await expect(other.request("malformed", {}, AbortSignal.timeout(3000))).rejects.toThrow("invalid_response");
  });
  it("bounds calls that never answer", async () => { const rpc = setup(); await expect(rpc.request("ignore", {}, new AbortController().signal, 30)).rejects.toThrow("timeout"); rpc.close(); });
});
