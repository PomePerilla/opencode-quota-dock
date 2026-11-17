import { For, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { DockController } from "./controller.js";
import type { AccountQuota, QuotaWindow } from "../quota/types.js";
import { compactCountdown, compactTone, periodWindows } from "./compact.js";
import { errorText, statusText } from "./format.js";

export function CompactQuota(props: { controller: DockController; theme: Accessor<"dark" | "light">; visible: Accessor<boolean>; openSettings: () => void }) {
  const [now, setNow] = createSignal(Date.now());
  const view = crypto.randomUUID();
  const timer = setInterval(() => { if (props.visible()) setNow(Date.now()); }, 1_000);
  createEffect(() => props.controller.visible(view, props.visible()));
  onCleanup(() => { clearInterval(timer); props.controller.visible(view, false); });
  const accounts = createMemo(() => {
    const snapshot = props.controller.snapshot();
    if (!snapshot) return [];
    return snapshot.accounts.filter(account => snapshot.preferences.accounts[account.accountRef]?.monitored !== false)
      .sort((a, b) => Number(snapshot.preferences.accounts[b.accountRef]?.pinned ?? false) - Number(snapshot.preferences.accounts[a.accountRef]?.pinned ?? false) || a.alias.localeCompare(b.alias, "zh-CN"));
  });
  return <div class="qd-compact" data-theme={props.theme()} role="group" aria-label="账户剩余额度">
    <For each={accounts()}>{account => <CompactAccount account={account} controller={props.controller} now={now} openSettings={props.openSettings} />}</For>
  </div>;
}

function CompactAccount(props: { account: AccountQuota; controller: DockController; now: Accessor<number>; openSettings: () => void }) {
  const windows = () => periodWindows(props.account.windows);
  const title = () => {
    const details = [props.account.alias];
    for (const [label, quota] of [["5 小时", windows().fiveHour], ["每周", windows().weekly]] as const) {
      details.push(`${label}：${quota?.remainingPercent == null ? "剩余未知" : `剩余 ${quota.remainingPercent}%`} · ${quota?.resetsAt == null ? "重置时间未知" : quota.resetsAt <= props.now() ? "等待同步" : new Date(quota.resetsAt).toLocaleString()}`);
    }
    if (props.controller.error()) details.push(props.controller.error()!);
    else if (props.account.errorCode) details.push(errorText[props.account.errorCode] ?? statusText[props.account.status]);
    else if (props.account.status !== "ready") details.push(statusText[props.account.status]);
    details.push("点击刷新 · 右键设置");
    return details.join("\n");
  };
  return <button type="button" class="qd-compact-account" data-account-ref={props.account.accountRef}
    data-loading={props.account.refreshing ? "true" : undefined}
    title={title()} aria-label={title().split("\n").slice(0, -1).join("，")}
    onClick={() => void props.controller.refresh(props.account.accountRef)}
    onContextMenu={event => { event.preventDefault(); props.openSettings(); }}>
    <span class="qd-compact-name">{props.account.alias}</span>
    <CompactPeriod account={props.account} window={windows().fiveHour} period="five-hour" label="5 小时" now={props.now} offline={!!props.controller.error()} />
    <CompactPeriod account={props.account} window={windows().weekly} period="weekly" label="每周" now={props.now} offline={!!props.controller.error()} />
  </button>;
}

function CompactPeriod(props: { account: AccountQuota; window: QuotaWindow | undefined; period: string; label: string; now: Accessor<number>; offline: boolean }) {
  const remaining = () => props.window?.remainingPercent ?? null;
  const reset = () => props.window?.resetsAt ?? null;
  return <span class="qd-compact-quota" data-period={props.period} data-tone={props.offline ? "stale" : compactTone(props.account, props.window, props.now())}>
    <span class="qd-compact-track" classList={{ "qd-compact-unknown": remaining() === null }} role="progressbar"
      aria-label={`${props.account.alias}${props.label}剩余额度`} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={remaining() ?? undefined} aria-valuetext={remaining() === null ? "未知" : `剩余 ${remaining()}%`}>
      <span style={{ width: remaining() === null ? "0%" : `${remaining()}%` }} />
    </span>
    <span class="qd-compact-time">{compactCountdown(reset(), props.now())}</span>
  </span>;
}
