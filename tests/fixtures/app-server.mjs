import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const request = JSON.parse(line);
  if (request.method === "ignore") continue;
  if (request.method === "malformed") { process.stdout.write("{bad-json\n"); continue; }
  if (request.method === "sensitive-error") { process.stdout.write(JSON.stringify({ id: request.id, error: { code: -32000, message: "401 Unauthorized: Bearer test-sensitive-token" } }) + "\n"); continue; }
  if (request.method === "refresh") { process.stdout.write(JSON.stringify({ id: 991, method: "account/chatgptAuthTokens/refresh", params: { previousAccountId: "a" } }) + "\n"); continue; }
  if (request.id === 991 && request.result) { process.stdout.write(JSON.stringify({ id: 1, result: { refreshed: true } }) + "\n"); continue; }
  if (request.id !== undefined) {
    const response = JSON.stringify({ id: request.id, result: { accepted: request.method } }) + "\n";
    process.stdout.write(response.slice(0, 7)); setTimeout(() => process.stdout.write(response.slice(7)), 5);
  }
}
