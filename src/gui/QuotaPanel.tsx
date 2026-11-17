import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { AccountQuota, QuotaWindow } from "../quota/types.js";
import type { DockController } from "./controller.js";
import { age, errorText, minimumRemaining, statusText } from "./format.js";
import { compactCountdown } from "./compact.js";
import type { SettingsUi } from "./settings-ui.js";

export function QuotaPanel(props: { controller: DockController; ui: SettingsUi; visible?: Accessor<boolean>; theme: Accessor<"dark" | "light">; mono?: Accessor<string> }) {
  const controller = props.controller;
  const ui = props.ui;
  const viewId = crypto.randomUUID();
  const [search, setSearch] = createSignal("");
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 1_000);
  onCleanup(() => { clearInterval(timer); controller.visible(viewId, false); });
  createEffect(() => controller.visible(viewId, props.visible?.() ?? true));
  const accounts = createMemo(() => {
    const snapshot = controller.snapshot(); if (!snapshot) return [];
    return snapshot.accounts.filter(account => account.alias.toLocaleLowerCase().includes(search().toLocaleLowerCase()))
      .sort((a, b) => Number(snapshot.preferences.accounts[b.accountRef]?.pinned ?? false) - Number(snapshot.preferences.accounts[a.accountRef]?.pinned ?? false) || (snapshot.preferences.sort === "remaining" ? minimumRemaining(a) - minimumRemaining(b) : 0) || a.alias.localeCompare(b.alias, "zh-CN"));
  });
  const syncing = () => controller.busy() || controller.snapshot()?.accounts.some(account => account.refreshing);
  return <section class="qd-root" data-theme={props.theme()} aria-label="账户额度设置" style={{ "--qd-font-data": props.mono?.() ?? "ui-monospace, monospace" }}>
    <ui.SettingsLayout title="多账户额度" actions={<div class="qd-actions">
      <ui.Button size="small" onClick={() => controller.manage()}>账户</ui.Button>
      <ui.Button size="small" busy={!!syncing()} onClick={() => void controller.refresh()}><span aria-hidden="true">刷新</span><span class="qd-sr-only">刷新全部账户</span></ui.Button>
    </div>}>
    <div class="qd-filters">
      <ui.TextInput class="qd-search" type="search" label="搜索账户" placeholder="搜索" value={search()} onInput={setSearch} />
      <ui.Select label="账户排序" options={[{ value: "name", label: "名称" }, { value: "remaining", label: "额度" }]} value={controller.snapshot()?.preferences.sort ?? "name"} onChange={sort => void controller.preference({ sort })} />
    </div>
    <Show when={controller.error()}><div class="qd-notice qd-notice-error" role="alert">{controller.error()}</div></Show>
    <Show when={controller.snapshot()?.directoryError}><div class="qd-notice" role="status">账户同步失败</div></Show>
    <Show when={controller.snapshot() && !controller.snapshot()!.bridgeAvailable}><div class="qd-notice" role="status">Codex CLI 未连接</div></Show>
    <div class="qd-list" aria-label="账户列表" aria-busy={!!syncing()}>
      <Show when={controller.snapshot()} fallback={<div class="qd-empty" role="status">连接中</div>}>
        <Show when={accounts().length > 0} fallback={<div class="qd-empty"><h2>{search() ? "无匹配账户" : "无账户"}</h2><Show when={!search()}><ui.Button onClick={() => controller.manage()}>添加账户</ui.Button></Show></div>}>
          <For each={accounts()}>{account => <AccountCard account={account} controller={controller} now={now} ui={ui} />}</For>
        </Show>
      </Show>
    </div>
    </ui.SettingsLayout>
  </section>;
}

function AccountCard(props: { account: AccountQuota; controller: DockController; now: Accessor<number>; ui: SettingsUi }) {
  const ui = props.ui;
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  let renameControl: HTMLSpanElement | undefined;
  const preference = () => props.controller.snapshot()?.preferences.accounts[props.account.accountRef];
  const pinned = () => preference()?.pinned ?? false;
  const monitored = () => preference()?.monitored !== false;
  const warning = () => props.controller.snapshot()?.preferences.warningPercent ?? 20;
  const critical = () => props.controller.snapshot()?.preferences.criticalPercent ?? 5;
  const tone = () => !Number.isFinite(minimumRemaining(props.account)) ? "unknown" : minimumRemaining(props.account) <= critical() ? "critical" : minimumRemaining(props.account) <= warning() ? "warning" : "normal";
  const badge = () => !monitored() ? "已暂停" : props.account.refreshing ? "同步中" : props.account.errorCode ? errorText[props.account.errorCode] ?? statusText[props.account.status] : props.account.status !== "ready" ? statusText[props.account.status] : tone() === "unknown" ? "无数据" : tone() === "critical" ? "不足" : tone() === "warning" ? "偏低" : "";
  const closeEditor = () => { setEditing(false); queueMicrotask(() => renameControl?.querySelector("button")?.focus()); };
  const saveName = async () => {
    if (!draft().trim() || saving()) return;
    setSaving(true);
    await props.controller.preference({ accountRef: props.account.accountRef, account: { alias: draft().trim() } });
    setSaving(false);
    if (!props.controller.error()) closeEditor();
  };
  return <article class="qd-card" data-account-ref={props.account.accountRef} data-tone={tone()} classList={{ "qd-card-muted": !monitored() }}>
    <ui.SettingsSection>
    <ui.SettingsRow title={<div class="qd-card-head">
      <div class="qd-identity">
        <h2 title={props.account.alias}>{props.account.alias}</h2>
        <div class="qd-account-meta">
          <Show when={props.account.plan}><span class="qd-plan">{props.account.plan!.toUpperCase()}</span></Show>
          <Show when={badge()}><span class="qd-badge" data-status={props.account.status}>{badge()}</span></Show>
          <Show when={props.account.lastSuccessAt}><span class="qd-updated" title={new Date(props.account.lastSuccessAt!).toLocaleString()}>{age(props.account.lastSuccessAt, props.now())}</span></Show>
        </div>
      </div>
      <div class="qd-account-tools">
        <span ref={renameControl}><ui.Button size="small" variant="ghost-muted" onClick={() => { if (editing()) closeEditor(); else { setDraft(props.account.alias); setEditing(true); } }}><span aria-hidden="true">重命名</span><span class="qd-sr-only">重命名{props.account.alias}</span></ui.Button></span>
        <span class="qd-control-label"><span>置顶</span><ui.Switch label={`置顶${props.account.alias}`} hideLabel checked={pinned()} onChange={checked => void props.controller.preference({ accountRef: props.account.accountRef, account: { pinned: checked } })} /></span>
        <span class="qd-control-label"><span>监控</span><ui.Switch label={`监控${props.account.alias}`} hideLabel checked={monitored()} onChange={checked => void props.controller.preference({ accountRef: props.account.accountRef, account: { monitored: checked } })} /></span>
        <ui.Button size="small" variant="ghost-muted" disabled={props.account.refreshing || !monitored()} onClick={() => void props.controller.refresh(props.account.accountRef)}><span aria-hidden="true">刷新</span><span class="qd-sr-only">刷新{props.account.alias}</span></ui.Button>
      </div>
    </div>} />
    <Show when={editing()}><ui.SettingsRow title="名称"><form class="qd-name-editor" onSubmit={event => event.preventDefault()} onKeyDown={event => { if (event.key === "Escape" && !saving()) { event.preventDefault(); closeEditor(); } }} ref={element => queueMicrotask(() => { element.querySelector("input")?.focus(); element.querySelector("input")?.select(); })}>
      <ui.TextInput label={`${props.account.alias}名称`} class="qd-name-input" value={draft()} disabled={saving()} onInput={value => setDraft(value.slice(0, 80))} onSubmit={() => void saveName()} />
      <ui.Button size="small" variant="contrast" disabled={!draft().trim()} busy={saving()} onClick={() => void saveName()}>保存</ui.Button>
      <ui.Button size="small" disabled={saving()} onClick={closeEditor}>取消</ui.Button>
    </form></ui.SettingsRow></Show>
    <Show when={props.account.windows.length > 0} fallback={<ui.SettingsRow title="额度"><span class="qd-no-windows">—</span></ui.SettingsRow>}>
      <For each={props.account.windows}>{window => <WindowRow window={window} now={props.now} warning={warning()} critical={critical()} multiple={new Set(props.account.windows.map(w => w.bucket)).size > 1} ui={ui} />}</For>
    </Show>
    <Show when={props.account.credits}><ui.SettingsRow title="Credits"><span class="qd-credits">{props.account.credits!.unlimited ? "∞" : props.account.credits!.balance ?? "—"}</span></ui.SettingsRow></Show>
    <Show when={props.account.errorCode === "siwc_quota_unavailable"}><ui.SettingsRow title="ChatGPT"><ui.Button size="small" onClick={() => props.controller.manageUsage()}>ChatGPT 用量</ui.Button></ui.SettingsRow></Show>
    <Show when={props.account.status === "reauth_required" || props.account.errorCode === "missing_account_identity" || props.account.errorCode === "identity_changed"}><ui.SettingsRow title="账户"><ui.Button size="small" onClick={() => props.controller.manage()}>登录</ui.Button></ui.SettingsRow></Show>
    </ui.SettingsSection>
  </article>;
}

function WindowRow(props: { window: QuotaWindow; now: Accessor<number>; warning: number; critical: number; multiple: boolean; ui: SettingsUi }) {
  const ui = props.ui;
  const label = () => `${props.multiple ? `${props.window.bucket} · ` : ""}${props.window.label}`;
  const tone = () => props.window.remainingPercent === null ? "unknown" : props.window.remainingPercent <= props.critical ? "critical" : props.window.remainingPercent <= props.warning ? "warning" : "normal";
  return <ui.SettingsRow title={<span class="qd-window-label" title={label()}>{label()}</span>}><div class="qd-window" data-tone={tone()} data-period={props.window.durationMinutes === 300 ? "five-hour" : props.window.durationMinutes === 10_080 ? "weekly" : undefined}>
    <div class="qd-track" role="progressbar" aria-label={`${label()}剩余额度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={props.window.remainingPercent ?? undefined} aria-valuetext={props.window.remainingPercent === null ? "未知" : `剩余 ${props.window.remainingPercent}%`}><span style={{ width: props.window.remainingPercent === null ? "0%" : `${props.window.remainingPercent}%` }} /></div>
    <span class="qd-value">{props.window.state === "unlimited" ? "∞" : props.window.remainingPercent === null ? "—" : `${props.window.remainingPercent.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`}</span>
    <span class="qd-reset" aria-label={`${label()}重置倒计时`} title={props.window.resetsAt == null ? "—" : new Date(props.window.resetsAt).toLocaleString()}>{compactCountdown(props.window.resetsAt, props.now())}</span>
  </div></ui.SettingsRow>;
}
