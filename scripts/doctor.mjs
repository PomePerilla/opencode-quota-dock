import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { access, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
const command = promisify(execFile);
const desktopCli = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Programs", "ai.opencode.desktop", "resources", "opencode-cli.exe");
let hostVersion = "not found";
try { await access(desktopCli); hostVersion = (await command(desktopCli, ["--version"], { windowsHide: true })).stdout.trim(); } catch {}
let accounts = 0;
const endpoint = await Service.discover({ version: version => version.startsWith("2.3.") });
if (endpoint) {
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
  try { const result = await client.integration.get({ integrationID: "openai", location: { directory: process.cwd() } }); accounts = result.data.connections.filter(connection => connection.type === "credential" && connection.method === "oauth").length; } catch {}
}
const report = { hostVersion, serviceAvailable: !!endpoint, oauthAccounts: accounts, nodeVersion: process.version, checkedAt: new Date().toISOString() };
await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/doctor.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
