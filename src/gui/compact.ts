import type { AccountQuota, QuotaWindow } from "../quota/types.js";

/** Match actual durations, not primary/secondary position or whichever resets sooner. */
export function periodWindows(windows: QuotaWindow[]): { fiveHour: QuotaWindow | undefined; weekly: QuotaWindow | undefined } {
  const find = (minutes: number) => {
    const matching = windows.filter(window => window.durationMinutes === minutes);
    return matching.find(window => window.key.startsWith("codex:")) ?? matching[0];
  };
  return { fiveHour: find(300), weekly: find(10_080) };
}

export function compactCountdown(reset: number | null, now: number): string {
  if (reset === null) return "—";
  const minutes = Math.max(0, Math.ceil((reset - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d${hours % 24 ? `${hours % 24}h` : ""}`;
  if (hours > 0) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ""}`;
  return `${minutes}m`;
}

export function compactTone(account: AccountQuota, window: QuotaWindow | undefined, now: number): "normal" | "warning" | "critical" | "unknown" | "stale" {
  if (account.status !== "ready" || window?.resetsAt != null && window.resetsAt <= now) return "stale";
  const remaining = window?.remainingPercent;
  if (remaining == null) return "unknown";
  if (remaining <= 5) return "critical";
  if (remaining <= 20) return "warning";
  return "normal";
}
