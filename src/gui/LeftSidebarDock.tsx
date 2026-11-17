import { Show, createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { Portal } from "solid-js/web";
import type { DockController } from "./controller.js";
import { CompactQuota } from "./CompactQuota.js";
import { observeLeftSidebar, type SidebarTarget } from "./sidebar-mount.js";

export function LeftSidebarDock(props: { controller: DockController; theme: Accessor<"dark" | "light">; openSettings: () => void }) {
  const [target, setTarget] = createSignal<SidebarTarget | null>(null);
  const [visible, setVisible] = createSignal(false);
  const dispose = observeLeftSidebar(document, setTarget);
  onCleanup(dispose);
  createEffect(() => {
    const current = target();
    if (!current) { setVisible(false); return; }
    const check = () => {
      const rect = current.sidebar.getBoundingClientRect();
      setVisible(current.host.isConnected && current.sidebar.dataset.state !== "closed" && rect.width >= 96 && rect.height > 0);
    };
    const resize = new ResizeObserver(check);
    const mutation = new MutationObserver(check);
    resize.observe(current.sidebar);
    mutation.observe(current.sidebar, { attributes: true, attributeFilter: ["data-state", "data-peek", "hidden"] });
    check();
    onCleanup(() => { resize.disconnect(); mutation.disconnect(); });
  });
  return <Show when={target()} keyed>{current => <Portal mount={current.host}><CompactQuota controller={props.controller} theme={props.theme} visible={visible} openSettings={props.openSettings} /></Portal>}</Show>;
}
