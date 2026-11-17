import { QuotaError, type NormalizedQuota, type QuotaWindow } from "./types.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, limit = 80): string | null => typeof value === "string" && value.length <= limit && !/[\x00-\x1f]/.test(value) ? value : null;

export function windowLabel(minutes: number | null, position: number): string {
  if (minutes === 300) return "5 小时";
  if (minutes === 10_080) return "每周";
  if (minutes && minutes % 1_440 === 0) return `${minutes / 1_440} 天`;
  if (minutes && minutes % 60 === 0) return `${minutes / 60} 小时`;
  if (minutes) return `${minutes} 分钟`;
  return `窗口 ${position}`;
}

/** Accept the documented app-server shape only; never infer missing quotas. */
export function normalizeRateLimits(input: unknown): NormalizedQuota {
  const root = record(input);
  if (!root || !("rateLimits" in root || "rateLimitsByLimitId" in root)) throw new QuotaError("invalid_response");
  const byId = record(root.rateLimitsByLimitId);
  const buckets = byId && Object.keys(byId).length ? Object.entries(byId) : [["codex", root.rateLimits]] as [string, unknown][];
  if (buckets.length > 30) throw new QuotaError("invalid_response");
  const windows: QuotaWindow[] = [];
  let plan: string | null = null;
  let credits: NormalizedQuota["credits"] = null;
  for (const [fallbackId, raw] of buckets) {
    const bucket = record(raw);
    if (!bucket) continue;
    const id = text(bucket.limitId, 100) ?? text(fallbackId, 100);
    if (!id) throw new QuotaError("invalid_response");
    const label = text(bucket.limitName, 120) ?? id;
    plan ??= text(bucket.planType);
    for (const [position, key] of ["primary", "secondary"].entries()) {
      if (bucket[key] == null) continue;
      const value = record(bucket[key]);
      if (!value) throw new QuotaError("invalid_response");
      const duration = finite(value.windowDurationMins) && value.windowDurationMins > 0 && value.windowDurationMins <= 5_256_000 ? value.windowDurationMins : null;
      const percent = finite(value.usedPercent) && value.usedPercent >= 0 && value.usedPercent <= 100 ? value.usedPercent : null;
      const seconds = value.resetsAt;
      const resetsAt = finite(seconds) && seconds >= 0 && seconds < 100_000_000_000 ? seconds * 1_000 : null;
      windows.push({ key: `${id}:${key}`, bucket: label, label: windowLabel(duration, position + 1), durationMinutes: duration, usedPercent: percent, remainingPercent: percent === null ? null : Math.round((100 - percent) * 100) / 100, resetsAt, state: percent === null ? "unknown" : "known" });
    }
    const c = record(bucket.credits);
    if (c && credits === null) {
      const balance = typeof c.balance === "string" && /^\d{1,12}(\.\d{1,8})?$/.test(c.balance) ? c.balance : finite(c.balance) && c.balance >= 0 && c.balance < 1e12 ? String(c.balance) : null;
      credits = { balance, unlimited: c.unlimited === true };
    }
  }
  // An empty successful envelope means unknown, not 0% or full capacity.
  return { windows, plan, credits };
}
