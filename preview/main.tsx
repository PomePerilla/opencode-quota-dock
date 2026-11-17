import { render } from "solid-js/web";
import { createSignal, onCleanup } from "solid-js";
import { QuotaPanel } from "../src/gui/QuotaPanel.js";
import { makeController, type DockApi } from "../src/gui/controller.js";
import { preferencesSchema, type AccountQuota, type Snapshot } from "../src/quota/types.js";
import "../src/gui/panel.css";
import "../src/gui/tokens.css";
import "./preview.css";
import "../src/gui/compact.css";
import { CompactPreview } from "./compact-preview.js";
import { previewSettingsUi } from "./settings-ui.js";

const now = Date.now();
const account = (ref: string, alias: string, plan: string, used: number, weekly: number): AccountQuota => ({ accountRef: ref, alias, plan, status: "ready", windows: [
  { key: "codex:primary", bucket: "codex", label: "5 小时", durationMinutes: 300, usedPercent: used, remainingPercent: 100 - used, resetsAt: now + 8_280_000, state: "known" },
  { key: "codex:secondary", bucket: "codex", label: "每周", durationMinutes: 10080, usedPercent: weekly, remainingPercent: 100 - weekly, resetsAt: now + 243_000_000, state: "known" },
], credits: null, source: "codex-app-server", lastSuccessAt: now - 23_000, lastAttemptAt: now - 23_000, errorCode: null, refreshing: false, revision: 1 });
let state: Snapshot = { accounts: [account("demo-personal", "个人账户", "pro", 28, 59), account("demo-work", "工作账户", "plus", 92, 36), { ...account("demo-spare", "备用账户", "plus", 20, 30), windows: [], status: "reauth_required", errorCode: "reauth_required", lastSuccessAt: null }], preferences: preferencesSchema.parse({ accounts: { "demo-personal": { pinned: true } } }), revision: 1, generatedAt: now, bridgeAvailable: true, directoryError: false };
const initialAccounts = structuredClone(state.accounts);
let offline = false;
let saveFailure = false;
const api: DockApi = {
  async snapshot() { if (offline) throw new Error("offline"); return structuredClone(state); },
  async refresh({ accountRef }) { await new Promise(resolve => setTimeout(resolve, 350)); if (offline) throw new Error("offline"); state.revision++; for (const item of state.accounts) if ((!accountRef || item.accountRef === accountRef) && item.status === "ready") item.lastSuccessAt = Date.now(); return structuredClone(state); },
  async preferences(input) { if (saveFailure) throw new Error("save_failed"); if (input.sort) state.preferences.sort = input.sort; if (input.accountRef && input.account) { state.preferences.accounts[input.accountRef] = { ...state.preferences.accounts[input.accountRef], ...input.account }; if (input.account.alias) state.accounts.find(a => a.accountRef === input.accountRef)!.alias = input.account.alias; } state.revision++; return structuredClone(state); },
  async visibility() { return { ok: true }; },
};
function Preview() {
  const compact = new URLSearchParams(location.search).get("view") !== "detail";
  if (compact) {
    state.accounts = [account("demo-xz", "XZ", "plus", 28, 59), account("demo-xy", "XY", "plus", 60, 36)];
    state.accounts[0]!.windows[0]!.resetsAt = now + 92 * 60_000;
    state.accounts[1]!.windows[0]!.resetsAt = now + 9 * 60_000;
    state.accounts[1]!.windows[1]!.resetsAt = now + (23 * 60 + 59) * 60_000;
    if (new URLSearchParams(location.search).get("sample") === "unknown") {
      Object.assign(state.accounts[1]!, { windows: [], status: "unsupported", errorCode: "siwc_quota_unavailable", lastSuccessAt: null });
    }
    state.preferences = preferencesSchema.parse({});
  }
  const [theme, setTheme] = createSignal<"dark" | "light">(new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark");
  const [mode, setMode] = createSignal("normal");
  const controller = makeController(() => api, () => alert("预览模式：真实插件会打开 OpenCode 账户管理。"));
  onCleanup(controller.dispose);
  void controller.load();
  if (compact) return <CompactPreview controller={controller.controller} theme={theme} />;
  return <><aside class="preview-toolbar"><strong>模拟数据</strong><div><button onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}>切换主题</button><select aria-label="预览状态" value={mode()} onChange={event => {
    setMode(event.currentTarget.value); offline = mode() === "offline"; saveFailure = mode() === "save-error";
    if (mode() === "empty") state.accounts = [];
    else if (mode() !== "offline") {
      state.accounts = structuredClone(initialAccounts);
      if (mode() === "unknown") state.accounts[0]!.windows = [];
      if (mode() === "unsupported") Object.assign(state.accounts[0]!, { windows: [], status: "unsupported", errorCode: "siwc_quota_unavailable", lastSuccessAt: null });
    }
    state.directoryError = mode() === "directory-error";
    state.bridgeAvailable = mode() !== "bridge-error";
    state.revision++; void controller.load();
  }}><option value="normal">正常</option><option value="offline">离线</option><option value="empty">空账户</option><option value="unknown">未知</option><option value="unsupported">不支持</option><option value="save-error">保存失败</option><option value="directory-error">账户同步失败</option><option value="bridge-error">CLI 未连接</option></select></div></aside><main class="preview-shell"><QuotaPanel controller={controller.controller} ui={previewSettingsUi} theme={theme} /></main></>;
}
render(() => <Preview />, document.getElementById("app")!);
