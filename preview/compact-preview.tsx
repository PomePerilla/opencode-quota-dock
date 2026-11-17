import { createSignal, onCleanup, type Accessor } from "solid-js";
import { LeftSidebarDock } from "../src/gui/LeftSidebarDock.js";
import type { DockController } from "../src/gui/controller.js";

export function CompactPreview(props: { controller: DockController; theme: Accessor<"dark" | "light"> }) {
  const [open, setOpen] = createSignal(true);
  const [present, setPresent] = createSignal(true);
  const [width, setWidth] = createSignal(240);
  const [settings, setSettings] = createSignal(false);
  onCleanup(() => props.controller.visible("preview", false));
  return <div class="mini-preview-app" data-theme={props.theme()}>
    <div class="mini-preview-toolbar"><span>左下角紧凑预览 · 模拟数据</span><button onClick={() => setOpen(!open())}>收起/展开</button><button onClick={() => setPresent(!present())}>移除/恢复侧栏</button><select aria-label="侧栏宽度" value={width()} onChange={event => setWidth(Number(event.currentTarget.value))}><option value="240">240px</option><option value="136">136px</option><option value="160">160px</option><option value="320">320px</option></select></div>
    <div class="mini-preview-workspace">
      {present() && <aside id="vertical-tabs-sidebar" data-slot="vertical-tabs-sidebar" data-state={open() ? "open" : "closed"} style={{ width: open() ? `${width()}px` : "0px" }}>
        <div data-slot="vertical-tabs-mount" style={{ width: `${width()}px` }}>
          <div class="native-sidebar-content"><div class="native-sidebar-header">OpenCode</div><div class="native-sidebar-scroll">主页<br />搜索会话<br /><br />最近会话</div><div class="native-sidebar-footer">设置</div></div>
        </div>
      </aside>}
      <main class="mini-preview-chat"><span>主工作区</span>{settings() && <div role="dialog" aria-label="额度设置">设置入口已打开<button onClick={() => setSettings(false)}>关闭</button></div>}</main>
    </div>
    <LeftSidebarDock controller={props.controller} theme={props.theme} openSettings={() => setSettings(true)} />
  </div>;
}
