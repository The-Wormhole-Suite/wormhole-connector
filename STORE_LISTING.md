# Store Listing

## Mozilla summary

Control Pi-hole v6 and AdGuard Home from Firefox, manage global and scoped allow/deny rules with recoverable timers, and see DNS protection status in the toolbar.

## Full description

Wormhole Connector is an independent third-party browser extension for controlling Pi-hole v6 and AdGuard Home directly from Firefox and Chromium-based browsers.

Key features:

- Combine up to four Pi-hole v6 and AdGuard Home connectors.
- Enable or disable protection on every configured connector.
- Add the current domain to global allow or deny rules.
- Select a common scope: a Pi-hole client group or AdGuard Home persistent client.
- Manage scope-specific domain rules and temporary allowances.
- Disable or temporarily pause filtering for a selected scope.
- Restore temporary changes automatically when their timers expire.
- Show allowed, blocked, temporary, disabled, mixed, and unavailable states in the toolbar.
- Use configurable timer presets, keyboard shortcuts, and context-menu actions.
- Export and import non-secret settings as a local, versioned JSON backup.
- Optionally synchronize selected non-secret settings through the browser provider.
- Use English, German, Spanish, French, Brazilian Portuguese, Polish, Italian, or Dutch.

Privacy:

The extension communicates only with Pi-hole and AdGuard Home addresses configured by the user. Authentication information and the current domain are sent only to those connectors as required for requested status checks and actions.

Passwords, application passwords, session identifiers, CSRF values, and temporary-action state remain in local extension storage. They are never included in backup files or browser synchronization.

The extension does not use analytics, telemetry, advertising, an uninstall questionnaire, or a developer-operated cloud service.

Requirements:

- Pi-hole v6 or later and/or AdGuard Home 0.107.58 or later.
- Direct network access from the browser to every configured connector address.
- Credentials for each configured backend.
- Firefox Desktop 140 or later, or a current Chromium-based desktop browser.

This is an independent third-party extension. It is not developed, endorsed, sponsored, or supported by the Pi-hole or AdGuard projects.

## Permission justifications

| Permission | Store text |
| --- | --- |
| `storage` | Stores DNS connector settings, user preferences, timer presets, Pi-hole session state, and temporary-action recovery data. Selected non-secret preference categories may optionally use the browser's synchronization service. |
| HTTP/HTTPS access to all URLs | Allows the extension to communicate with arbitrary user-configured Pi-hole or AdGuard Home HTTP/HTTPS addresses, including private network hostnames and IP addresses. It does not inject scripts into or read page content. |
| `activeTab` | Reads the active tab's URL after user interaction so the current domain can be checked or added to a DNS filtering rule. |
| `contextMenus` | Provides user-configurable DNS-protection actions in the browser context menu. |
| `alarms` | Restores temporary domain and scope changes when their configured duration expires. |

## Submission notes

Use [AMO_REVIEWER_NOTES.md](AMO_REVIEWER_NOTES.md) for Mozilla's reviewer-notes field and [PRIVACY](PRIVACY) as the published privacy policy. The submitted Firefox XPI and Chrome ZIP are intentionally unsigned; Mozilla and the Chrome Web Store sign the accepted packages.
