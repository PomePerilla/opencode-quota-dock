# Compatibility

Quota Dock **0.1.6** is an experimental, version-pinned integration for **OpenCode Desktop 2.3.0**.

## Environment

| Component | Verified version |
| --- | --- |
| OS | Windows x64 |
| OpenCode Desktop / SDK | 2.3.0 |
| Codex CLI | 0.153.4 |
| Node.js | 24.19.0; package requires 22+ |
| UI | Host-provided Solid runtime and settings components |

Other host versions, macOS and Linux have not been accepted as supported targets.

## Authentication

| Connection | Behavior |
| --- | --- |
| Codex legacy OAuth with trusted `metadata.accountID` | Supported by the experimental App Server bridge. |
| New Sign in with ChatGPT with `metadata.clientID` but no `accountID` | Unsupported; the settings page links to ChatGPT usage. |
| API key or external credentials | Excluded from subscription monitoring. |

The plugin does not decrypt opaque authentication metadata, decode a token to guess account identity, or combine one connection's identity with another connection's token.

## Integration boundaries

The sidebar is mounted through a GUI `window.bottom` contribution and an owned Portal container under OpenCode 2.3.0's `#vertical-tabs-sidebar [data-slot="vertical-tabs-mount"]`. The SDK has no dedicated public left-sidebar slot. The adapter removes only its own container and follows sidebar collapse and recreation; host upgrades require revalidation.

Settings use the SDK's public `ctx.ui` components: SettingsLayout, SettingsSection, SettingsRow, Button, TextInput, Select and Switch. Standalone preview controls are an adapter for interaction checks, not the actual host implementation.

Quota reads use Codex App Server's `account/rateLimits/read` with externally supplied authentication. In the tested CLI, generated schema marks the `chatgptAuthTokens` mode as internal/unstable. Successful reads establish compatibility with the tested version and authentication method, not a stable future protocol guarantee.

## Validation

- Type checking, production build, 23 core tests and 8 UI checks form the release checks.
- Core tests cover window normalization, bounded concurrency, cancellation, failure isolation, identity changes and credential redaction.
- Browser checks cover independent five-hour/weekly readings, aligned countdown columns, sidebar remounts, settings actions, short error states and narrow layouts.
- Actual Desktop inspection confirms sidebar and native settings rendering with real quota readings under compatible authentication.
- A live smoke run passes only when at least two accounts are ready and account identity/order and the active account remain unchanged. Browser checks and screenshots do not substitute for that live check.

Pending validation includes real authentication expiry and network recovery, long-running multi-window sessions, sleep/wake, mixed DPI and cross-display behavior, and comparison of each account's readings against its official usage page. Saved preferences are restored on startup; old quota readings are not displayed before identity is verified.

## Sources

- [OpenCode GUI plugins](https://opencode.ai/docs/build/plugins/gui/)
- [OpenCode Server plugins](https://opencode.ai/docs/build/plugins/server/)
- [OpenCode RPC](https://opencode.ai/docs/build/plugins/rpc/)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Sign in with ChatGPT token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)
- [Sign in with ChatGPT account and usage management](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
