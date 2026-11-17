import { createEffect, onCleanup } from "solid-js";
import { Command, Plugin, SettingsPage, Slot, Style } from "@opencode/plugin/gui";
import { QuotaDock } from "./rpc.js";
import { makeController } from "./gui/controller.js";
import { QuotaPanel } from "./gui/QuotaPanel.js";
import css from "./gui/panel.css?inline";
import tokens from "./gui/tokens.css?inline";
import compactCss from "./gui/compact.css?inline";
import { LeftSidebarDock } from "./gui/LeftSidebarDock.js";

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, `${tokens}\n${css}\n${compactCss}`);
    const state = makeController(() => ctx.client.rpc(QuotaDock), () => ctx.layout.settings("providers"), () => ctx.system.openExternal("https://chatgpt.com/settings/usage"));
    let unsubscribe = () => {};
    createEffect(() => {
      const client = ctx.client;
      unsubscribe(); state.reset();
      unsubscribe = client.rpc(QuotaDock).events.on("updated", () => { void state.load(); });
    });
    onCleanup(() => { unsubscribe(); state.dispose(); });
    const open = () => ctx.layout.settings("quota-dock-settings");
    ctx.add(Slot, { at: "window.bottom", render: () => <LeftSidebarDock controller={state.controller} theme={() => ctx.appearance.mode()} openSettings={open} /> });
    ctx.add(Command, { id: "open", title: "多账户额度设置", group: "Quota Dock", run: open });
    ctx.add(SettingsPage, {
      id: "quota-dock-settings", title: "多账户额度",
      render() { return <QuotaPanel controller={state.controller} ui={ctx.ui} theme={() => ctx.appearance.mode()} mono={() => ctx.appearance.font("mono")} />; },
    });
  },
});
