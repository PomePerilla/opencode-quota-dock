import type { AccountQuota } from "../quota/types.js";
export const minimumRemaining = (account: AccountQuota): number => Math.min(...account.windows.filter(window => window.remainingPercent !== null).map(window => window.remainingPercent!), Infinity);
export function countdown(reset: number | null, now: number): string {
  if (reset === null) return "重置时间未知";
  if (reset <= now) return "已到重置时间 · 等待同步";
  const minutes = Math.ceil((reset - now) / 60_000);
  if (minutes >= 1_440) return `${Math.floor(minutes / 1_440)} 天 ${Math.floor(minutes % 1_440 / 60)} 小时后重置`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分后重置`;
  return `${minutes} 分钟后重置`;
}
export function age(time: number | null, now: number): string {
  if (time === null) return "尚未同步";
  const seconds = Math.max(0, Math.floor((now - time) / 1_000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} 分钟前`;
  return `${Math.floor(seconds / 3_600)} 小时前`;
}
export const statusText: Record<AccountQuota["status"], string> = { loading: "同步中", ready: "已同步", stale: "已过期", offline: "离线", reauth_required: "需登录", unsupported: "暂不支持", error: "读取失败" };
export const errorText: Record<string, string> = {
  siwc_quota_unavailable: "暂不支持",
  bridge_unavailable: "CLI 未连接",
  protocol_unsupported: "版本不兼容",
  missing_account_identity: "需登录",
  reauth_required: "需登录",
  identity_changed: "需登录",
  timeout: "超时",
  offline: "离线",
  invalid_response: "数据异常",
  rate_limited: "限流中",
  bridge_failed: "读取失败",
};
