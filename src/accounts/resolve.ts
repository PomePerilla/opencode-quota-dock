import type { Connection, HostAccounts } from "./directory.js";
import { QuotaError } from "../quota/types.js";

/** Cancels this observer, without taking ownership of the host's credential refresh. */
export function resolveCredential(host: HostAccounts, connection: Connection, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) return Promise.reject(new QuotaError("cancelled"));
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new QuotaError("cancelled")); };
    const timer = setTimeout(() => { cleanup(); reject(new QuotaError("timeout")); }, 20_000);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => host.resolve(connection)).then(value => { cleanup(); resolve(value); }, () => { cleanup(); reject(new QuotaError("reauth_required")); });
  });
}
