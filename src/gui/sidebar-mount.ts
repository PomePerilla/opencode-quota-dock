export interface SidebarTarget { host: HTMLElement; sidebar: HTMLElement; }

/** OpenCode 2.3 DOM adapter: the SDK has no left-sidebar slot. Own/remove only our container. */
export function observeLeftSidebar(doc: Document, onTarget: (target: SidebarTarget | null) => void): () => void {
  let target: SidebarTarget | null = null;
  let frame: number | undefined;
  let stopped = false;
  const view = doc.defaultView;
  if (!view) return () => {};
  const reconcile = () => {
    frame = undefined;
    if (stopped) return;
    const sidebar = doc.querySelector<HTMLElement>('#vertical-tabs-sidebar[data-slot="vertical-tabs-sidebar"]');
    const mount = sidebar?.querySelector<HTMLElement>('[data-slot="vertical-tabs-mount"]');
    if (target && target.host.parentElement === mount && target.host.isConnected) return;
    if (target) { target.host.remove(); target = null; onTarget(null); }
    if (!sidebar || !mount) return;
    const host = doc.createElement("div");
    host.className = "qd-sidebar-host";
    host.dataset.quotaDock = "left-footer";
    mount.append(host);
    target = { host, sidebar };
    onTarget(target);
  };
  const schedule = () => { if (frame === undefined && !stopped) frame = view.requestAnimationFrame(reconcile); };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  reconcile();
  return () => {
    stopped = true; observer.disconnect(); if (frame !== undefined) view.cancelAnimationFrame(frame);
    target?.host.remove(); target = null; onTarget(null);
  };
}
