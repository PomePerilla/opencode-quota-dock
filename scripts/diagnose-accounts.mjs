import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { QuotaDock } from "../dist/rpc.js";
const endpoint = await Service.discover();
if (!endpoint) throw new Error("OpenCode service unavailable");
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
const result = await client.rpc(QuotaDock).diagnostics({}, { location: { directory: process.cwd() } });
console.log(JSON.stringify(result.accounts.map((entry, i) => ({ index: i + 1, ...entry, accountRef: undefined })), null, 2));
