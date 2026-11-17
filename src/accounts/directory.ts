import { createHash } from "node:crypto";
import { QuotaError } from "../quota/types.js";

export interface Connection { type: "credential"; id: string; label: string; method: "key" | "oauth" | "external"; }
export interface OAuthMaterial { access: string; accountId: string; plan: string | null; }
export interface HostAccounts {
  list(): Promise<Connection[]>;
  resolve(connection: Connection): Promise<unknown>;
}
export interface MonitoredAccount { ref: string; connection: Connection; }
export const accountRef = (id: string) => `acct_${createHash("sha256").update(id).digest("hex").slice(0, 24)}`;

export function makeDirectory(connections: Connection[]): MonitoredAccount[] {
  const seen = new Set<string>();
  return connections.filter(c => c.type === "credential" && c.method === "oauth" && !seen.has(c.id) && !!seen.add(c.id))
    .slice(0, 10).map(connection => ({ ref: accountRef(connection.id), connection }));
}

/** Account scope comes from OpenCode's saved authentication metadata, never an email or a decoded JWT. */
export function oauthMaterial(raw: unknown): OAuthMaterial {
  if (!raw || typeof raw !== "object") throw new QuotaError("reauth_required");
  const value = raw as Record<string, unknown>;
  if (value.type !== "oauth" || typeof value.access !== "string" || value.access.length < 8) throw new QuotaError("reauth_required");
  const metadata = value.metadata as Record<string, unknown> | undefined;
  const id = metadata?.accountID;
  if ((!id || typeof id !== "string") && typeof metadata?.clientID === "string") throw new QuotaError("siwc_quota_unavailable");
  if (typeof id !== "string" || !id || id.length > 200 || /[\x00-\x20]/.test(id)) throw new QuotaError("missing_account_identity");
  return { access: value.access, accountId: id, plan: typeof metadata?.planType === "string" ? metadata.planType.slice(0, 80) : null };
}
