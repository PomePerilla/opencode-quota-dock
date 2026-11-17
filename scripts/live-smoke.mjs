import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { mkdir, writeFile } from "node:fs/promises";
import { QuotaDock } from "../dist/rpc.js";
const endpoint = await Service.discover({ version: version => version.startsWith("2.3.") });
if (!endpoint) throw new Error("OpenCode 2.3 service is not running.");
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
const location = { directory: process.cwd() };
const before = await client.integration.get({ integrationID: "openai", location });
const signature = data => JSON.stringify(data.connections.map(c => ({ type: c.type, ...(c.type === "credential" ? { id: c.id, label: c.label } : { name: c.name }) })));
const start = performance.now();
const rpc = client.rpc(QuotaDock);
let initial;
for (let attempt = 0; attempt < 10; attempt++) {
  try { initial = await rpc.snapshot({}, { location }); break; }
  catch (error) { if (error?.type !== "rpc.unavailable" || attempt === 9) throw error; await new Promise(resolve => setTimeout(resolve, 750)); }
}
const beforeDiagnostics = await rpc.diagnostics({}, { location });
const refreshed = await rpc.refresh({}, { location, signal: AbortSignal.timeout(120_000) });
const after = await client.integration.get({ integrationID: "openai", location });
const afterDiagnostics = await rpc.diagnostics({}, { location });
const report = {
  plugin: "0.1.6", checkedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - start),
  accountCount: refreshed.accounts.length, bridgeAvailable: refreshed.bridgeAvailable,
  accountOrderAndIdentityUnchanged: signature(before.data) === signature(after.data),
  activeAccountUnchanged: beforeDiagnostics.activeAccountRef === afterDiagnostics.activeAccountRef,
  results: refreshed.accounts.map((account, index) => ({ index: index + 1, status: account.status, errorCode: account.errorCode, plan: account.plan, windows: account.windows.map(window => ({ label: window.label, remainingPercent: window.remainingPercent, resetsAt: window.resetsAt })), lastSuccessAt: account.lastSuccessAt })),
  ready: refreshed.accounts.filter(account => account.status === "ready").length,
  initializedAccounts: initial.accounts.length,
};
await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/live-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.accountOrderAndIdentityUnchanged || !report.activeAccountUnchanged || report.ready < 2) process.exitCode = 2;
