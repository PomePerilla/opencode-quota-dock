import { createSignal, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { AccountPreference, Snapshot } from "../quota/types.js";

export interface DockController {
  snapshot: Accessor<Snapshot | undefined>;
  error: Accessor<string | null>;
  busy: Accessor<boolean>;
  refresh(ref?: string): Promise<void>;
  preference(input: { accountRef?: string; account?: AccountPreference; sort?: "name" | "remaining" }): Promise<void>;
  visible(id: string, shown: boolean): void;
  manage(): void;
  manageUsage(): void;
}
export interface DockApi {
  snapshot(input: Record<string, never>): Promise<Snapshot>;
  refresh(input: { accountRef?: string }): Promise<Snapshot>;
  preferences(input: { accountRef?: string; account?: AccountPreference; sort?: "name" | "remaining" }): Promise<Snapshot>;
  visibility(input: { clientId: string; visible: boolean }): Promise<{ ok: boolean }>;
}

export function makeController(api: () => DockApi, manage: () => void, manageUsage: () => void = () => {}) {
  const [data, setData] = createStore<{ snapshot: Snapshot | undefined }>({ snapshot: undefined });
  const snapshot = () => data.snapshot;
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const views = new Set<string>();
  const clientId = crypto.randomUUID();
  let disposed = false;
  let loading: Promise<void> | undefined;
  let refreshPending: Promise<void> | undefined;
  let generation = 0;
  const visible = () => views.size > 0 && document.visibilityState !== "hidden";
  const accept = (value: Snapshot) => {
    if (disposed) return;
    if (!snapshot() || value.revision >= snapshot()!.revision) setData("snapshot", reconcile(value, { key: "accountRef" }));
    setError(null);
  };
  const load = () => loading ??= (async () => {
    const epoch = generation;
    try { const value = await api().snapshot({}); if (epoch === generation) accept(value); }
    catch { if (!disposed && epoch === generation) setError("服务离线"); }
  })().finally(() => { loading = undefined; });
  const heartbeat = async () => {
    if (disposed) return;
    try { await api().visibility({ clientId, visible: visible() }); } catch { if (!disposed) setError("服务离线"); }
    if (visible()) await load();
  };
  const listener = () => void heartbeat();
  document.addEventListener("visibilitychange", listener);
  const timer = setInterval(() => void heartbeat(), 20_000);
  const controller: DockController = {
    snapshot, error, busy, manage, manageUsage,
    async refresh(ref) {
      if (refreshPending) return refreshPending;
      setBusy(true);
      const epoch = generation;
      refreshPending = (async () => {
        try { const result = await api().refresh(ref ? { accountRef: ref } : {}); if (epoch === generation) accept(result); }
        catch { if (!disposed) setError("刷新失败"); }
        finally { if (!disposed) setBusy(false); refreshPending = undefined; }
      })();
      return refreshPending;
    },
    async preference(input) {
      const epoch = generation;
      try { const result = await api().preferences(input); if (epoch === generation) accept(result); }
      catch { if (!disposed) setError("保存失败"); }
    },
    visible(id, shown) {
      if (shown) views.add(id); else views.delete(id);
      void heartbeat();
    },
  };
  return {
    controller, load,
    reset() { generation++; setData("snapshot", undefined); setError(null); void heartbeat(); },
    dispose() {
      disposed = true; generation++; clearInterval(timer); document.removeEventListener("visibilitychange", listener);
      void api().visibility({ clientId, visible: false }).catch(() => {});
    },
  };
}
