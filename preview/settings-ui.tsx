import { For, Show } from "solid-js";
import type { UiSelectProps } from "@opencode/plugin/gui";
import type { SettingsUi } from "../src/gui/settings-ui.js";
import "./settings-ui.css";

// The installed plugin receives ctx.ui. This standalone adapter only exercises
// the same component props and callbacks without an OpenCode renderer.
export const previewSettingsUi: SettingsUi = {
  SettingsLayout: props => <div class="preview-native-layout"><header class="preview-native-header"><h1>{props.title}</h1><div>{props.actions}</div></header><main>{props.children}</main></div>,
  SettingsSection: props => <section class="preview-native-section"><Show when={props.title}><h2>{props.title}</h2></Show><div class="preview-native-group">{props.children}</div>{props.footer}</section>,
  SettingsRow: props => <div class="preview-native-row"><div class="preview-native-title">{props.title}<Show when={props.description}><div>{props.description}</div></Show></div><Show when={props.children}><div class="preview-native-control">{props.children}</div></Show></div>,
  Button: props => <button class={`preview-native-button ${props.class ?? ""}`} data-variant={props.variant ?? "neutral"} data-size={props.size ?? "normal"} type={props.type ?? "button"} disabled={props.disabled || props.busy} onClick={props.onClick}>{props.children}</button>,
  TextInput: props => <input class={`preview-native-input ${props.class ?? ""}`} type={props.type ?? "text"} aria-label={props.label} aria-invalid={props.invalid || undefined} placeholder={props.placeholder} value={props.value} disabled={props.disabled} onInput={event => props.onInput(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter" && !event.isComposing && props.onSubmit) { event.preventDefault(); props.onSubmit(event.currentTarget.value); } }} />,
  Switch: props => <label class="preview-native-switch"><input type="checkbox" role="switch" aria-label={props.label} checked={props.checked} disabled={props.disabled} onChange={event => props.onChange(event.currentTarget.checked)} /><span aria-hidden="true" /><Show when={!props.hideLabel}>{props.label}</Show></label>,
  Select: function PreviewSelect<T extends string>(props: UiSelectProps<T>) { return <select class={`preview-native-select ${props.class ?? ""}`} aria-label={props.label} value={props.value} disabled={props.disabled} onChange={event => props.onChange(event.currentTarget.value as T)}><For each={props.options}>{option => <option value={option.value}>{option.label}</option>}</For></select>; },
};
