import { z } from "zod";

export const windowSchema = z.object({
  key: z.string().max(200), bucket: z.string().max(120), label: z.string().max(80),
  durationMinutes: z.number().positive().nullable(),
  usedPercent: z.number().min(0).max(100).nullable(),
  remainingPercent: z.number().min(0).max(100).nullable(),
  resetsAt: z.number().nonnegative().nullable(),
  state: z.enum(["known", "unknown", "unlimited"]),
});
export const accountSchema = z.object({
  accountRef: z.string().max(100), alias: z.string().max(80), plan: z.string().max(80).nullable(),
  status: z.enum(["loading", "ready", "stale", "offline", "reauth_required", "unsupported", "error"]),
  windows: z.array(windowSchema).max(100),
  credits: z.object({ balance: z.string().max(60).nullable(), unlimited: z.boolean() }).nullable(),
  source: z.literal("codex-app-server"),
  lastSuccessAt: z.number().nullable(), lastAttemptAt: z.number().nullable(),
  errorCode: z.string().max(80).nullable(), refreshing: z.boolean(), revision: z.number(),
});
export const accountPreferenceSchema = z.object({
  alias: z.string().trim().max(80).optional(), pinned: z.boolean().optional(), monitored: z.boolean().optional(),
});
export const preferencesSchema = z.object({
  accounts: z.record(z.string(), accountPreferenceSchema).default({}),
  sort: z.enum(["name", "remaining"]).default("name"),
  warningPercent: z.number().int().min(6).max(50).default(20),
  criticalPercent: z.number().int().min(0).max(5).default(5),
});
export const snapshotSchema = z.object({
  accounts: z.array(accountSchema), preferences: preferencesSchema,
  revision: z.number(), generatedAt: z.number(),
  bridgeAvailable: z.boolean(), directoryError: z.boolean(),
});
export type QuotaWindow = z.infer<typeof windowSchema>;
export type AccountQuota = z.infer<typeof accountSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type AccountPreference = z.infer<typeof accountPreferenceSchema>;
export type NormalizedQuota = Pick<AccountQuota, "windows" | "credits" | "plan">;

export class QuotaError extends Error {
  constructor(public readonly code: string, public readonly retryAfterMs = 0) { super(code); this.name = "QuotaError"; }
}

export function safeError(error: unknown): QuotaError {
  if (error instanceof QuotaError) return error;
  return new QuotaError("bridge_failed");
}
