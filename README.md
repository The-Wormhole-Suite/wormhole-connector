<p align="center">
  <img src="icon_raw/icon-raw.png" alt="Wormhole Connector logo" width="240">
</p>

<h1 align="center">Wormhole Connector</h1>

<p align="center"><strong>The Wormhole Suite — Domains, demystified.</strong></p>

<p align="center">
  <a href="https://github.com/HyperCriSiS/pihole-browser-extension/releases"><img src="https://img.shields.io/github/v/release/HyperCriSiS/pihole-browser-extension?include_prereleases&amp;sort=semver" alt="Latest release"></a>
  <a href="https://github.com/HyperCriSiS/pihole-browser-extension/actions/workflows/lint.yml"><img src="https://github.com/HyperCriSiS/pihole-browser-extension/actions/workflows/lint.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HyperCriSiS/pihole-browser-extension" alt="MIT license"></a>
</p>

Wormhole Connector controls Pi-hole v6 and AdGuard Home directly from Firefox or a Chromium-based browser. It provides global controls, domain rules, scoped client actions, recoverable timers, toolbar status, local settings backups, and optional non-secret browser synchronization. Up to four Pi-hole and AdGuard Home connectors can be combined.

This is an independent third-party extension. It is not developed, endorsed, sponsored, or supported by the Pi-hole or AdGuard projects.

## Continuation of the original project

Wormhole Connector is the actively maintained continuation of [Pi-hole Browser Extension by Pascal Glaser](https://github.com/badsgahhl/pihole-browser-extension). The original project is in maintenance mode. Its MIT license and contribution history are preserved; see [LICENSE](LICENSE), [NOTICE](NOTICE), and [CREDITS.md](CREDITS.md).

## Features

### DNS backends and domain controls

- Connect Pi-hole v6, AdGuard Home, or a mixture of both backend types.
- Enable or disable filtering across every configured connector.
- Show an explicit mixed state when connectors disagree.
- Check the current domain in the default backend context.
- Add the current domain to a permanent allow or deny rule on every connector.
- Configure up to four connections, including reverse-proxy path prefixes.
- Optionally reload the current tab after disabling filtering or allowing a domain.

### Scoped client actions

- Select a common scope directly in the popup. A scope is a Pi-hole client group or an AdGuard Home persistent client.
- Check whether the current domain is blocked for the selected scope.
- Assign allow or deny rules specifically to that scope.
- Temporarily allow the current domain for configurable durations.
- Enable, disable, or temporarily pause filtering for the selected scope.
- Use the selected scope's domain status for the toolbar indicator.

| Wormhole action | Pi-hole v6 | AdGuard Home |
| --- | --- | --- |
| Global protection | DNS blocking API | Protection API with native pause duration |
| Global domain rule | Domain assigned to all client groups | Custom DNS filtering rule |
| Scope | Client group | Persistent client |
| Scoped domain rule | Group assignment | `$client` rule modifier |
| Scope pause | Disable and later restore the group | Disable and later restore client filtering |

### Safe multi-instance behavior

- Resolve each scope separately by name on every connector, so Pi-hole numeric group IDs may differ.
- Preflight every configured connector before a multi-connector mutation begins.
- Serialize overlapping domain and scope actions to prevent extension-side read-modify-write races.
- Roll back already changed connectors when a later connector fails, where the backend still permits restoration.
- Preserve recovery records and retry failed timer restoration instead of silently discarding them.
- Report preflight, apply, and rollback failures per connector.
- Preserve every unrelated AdGuard Home custom rule byte-for-byte. Because AdGuard Home replaces its full custom-rule array, Wormhole re-reads it immediately before writing, aborts on conflicts, and verifies the result.

Independent DNS servers cannot provide a shared database transaction. Multi-connector writes are therefore best-effort with explicit failure reporting and rollback, not mathematically atomic.

### Backup and optional sync

- Export all non-secret settings to a versioned JSON backup.
- Validate an import strictly and show a preview before it can be applied.
- Optionally synchronize general settings, timer presets, the selected scope, and connector types/addresses as four independent categories.
- Keep every synchronization category off by default.
- Remove a category from browser sync when it is disabled.

Usernames, passwords, application passwords, SIDs, CSRF values, browser alarms, and running temporary actions are never exported or synchronized. Existing local credentials are retained when an imported or synchronized backend type and address match exactly.

### Toolbar status

The main toolbar icon remains visible while the browser-native badge presents the current state:

| Badge | Meaning |
| --- | --- |
| Green `✓` | DNS protection is active and the current domain is allowed |
| Red `×` | The current domain is blocked |
| Orange time, such as `5m` | The current domain is temporarily allowed |
| Blue-grey `OFF` | DNS protection is disabled |
| Purple `MIX` | Configured connectors have different global states |
| Yellow `!` | The current status is unavailable or an error occurred |

### Included languages

- English (`en`)
- German (`de`)
- Spanish (`es`)
- French (`fr`)
- Brazilian Portuguese (`pt_BR`)
- Polish (`pl`)
- Italian (`it`)
- Dutch (`nl`)

## Requirements

- Pi-hole v6 or later and/or AdGuard Home 0.107.58 or later.
- Firefox Desktop 140 or later, or a current Chromium-based desktop browser.
- Direct browser network access to every configured connector address.
- Pi-hole password/application password or AdGuard Home username/password credentials as applicable.

Firefox Android is not advertised for the first store release until popup layout, file import, alarms, and synchronization have been tested there separately.

## Installation

Until the store listings are published, download the appropriate package from [GitHub Releases](https://github.com/HyperCriSiS/pihole-browser-extension/releases).

### Chromium-based browsers

1. Download and extract the Chrome ZIP package.
2. Open the browser's extension page, such as `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the extracted directory.

### Firefox

The release artifact is intentionally unsigned for Mozilla submission and temporary testing. Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose the XPI. Standard Firefox installations require the final Mozilla-signed package for permanent use.

The store links will replace these developer-installation instructions as the primary installation route after publication.

## Setup

1. Open the extension popup and select the cog button.
2. Choose Pi-hole or AdGuard Home and enter the complete address, including `http://` or `https://` and any reverse-proxy prefix.
3. Enter the required credentials exactly as configured. AdGuard Home requires a username and password; Pi-hole accepts its password or application password. Spaces are preserved.
4. Save the connection and verify it with the connection check.
5. Optionally select a common default scope and customize popup sections, toolbar behavior, timer presets, backup, and synchronization.

For a normal installation, addresses such as `https://pi.example.net/admin` and `https://pi.example.net/api` both resolve to `https://pi.example.net/api/`. With a reverse-proxy prefix, `https://dns.example.net/pihole/admin` resolves to `https://dns.example.net/pihole/api/`.

For AdGuard Home, `https://dns.example.net/adguard` resolves to `https://dns.example.net/adguard/control/`. Enter the installation base or its `/control` path, not an individual API endpoint.

Use HTTPS whenever the network setup permits it. Prefer a dedicated Pi-hole application password instead of a primary account password; an application password is especially important when two-factor authentication is enabled.

## Status semantics

The domain status shown above the global domain actions uses the Pi-hole client group named `Default` and AdGuard Home's unscoped filtering check. It is not a claim that every possible group or client has the same result.

The selected-scope status is evaluated independently. Wormhole passes a Pi-hole group ID to Pi-hole and an identifier for the chosen persistent client to AdGuard Home. If a required scope is missing, a connector is unavailable, or connectors return incompatible results, the status becomes unknown rather than silently falling back.

## Privacy and permissions

The extension communicates only with Pi-hole and AdGuard Home addresses configured by the user. Authentication information and the current domain are sent only to those connectors as required for status checks and requested actions. Wormhole Connector has no analytics, telemetry, advertising, developer-operated cloud service, or inherited uninstall questionnaire.

Optional browser sync uses the browser provider only for categories explicitly enabled by the user. Connector types and addresses have their own opt-in category because internal hostnames and network topology can be sensitive and device-specific. Usernames and passwords remain local. Firefox and Chromium accounts do not synchronize with each other.

See [PRIVACY](PRIVACY) for the complete policy and [BACKUP_FORMAT.md](BACKUP_FORMAT.md) for the exact backup and synchronization boundaries.

The permissions are used as follows:

| Permission | Purpose |
| --- | --- |
| `storage` | Store DNS connectors, preferences, session state, timer recovery data, and optional non-secret synchronized categories |
| HTTP/HTTPS host access | Communicate with arbitrary user-configured Pi-hole or AdGuard Home addresses, including private hostnames and IP addresses |
| `activeTab` | Read the active tab URL after user interaction so its domain can be checked or added to a rule |
| `contextMenus` | Provide optional DNS-protection actions in the page context menu |
| `alarms` | Restore temporary domain and scope changes when their timers expire |

The extension does not inject scripts into websites or read page content.

## Troubleshooting

### A connection check fails

Verify the backend type, scheme, hostname, optional reverse-proxy prefix, username where applicable, and password. Do not remove spaces from a valid credential. Confirm that the proxy exposes Pi-hole at the corresponding `/api/` path or AdGuard Home at `/control/`.

### Domain status is unknown

A status requires a normal web-domain tab, reachable DNS connectors, and the required scope and rule data. Internal browser pages do not expose a normal domain. Pi-hole's default status deliberately becomes unknown if its `Default` group is missing; an AdGuard scoped status also requires at least one identifier on the persistent client.

### A multi-instance action reports a partial failure

The popup lists the affected connector and whether the failure occurred during preflight, apply, or rollback. Fix the unavailable connector or missing scope and retry. Timer recovery records remain stored and are retried automatically when a restoration request fails.

## Development

The project uses Vue, TypeScript, Vuetify, Webpack, and npm. Node.js versions 22 through 24 are supported.

```bash
npm ci --no-audit --no-fund
npm run check
```

`npm run check` runs TypeScript and Vue template checking, ESLint, Prettier, locale validation, tests, production builds for both browsers, Mozilla linting, package-content validation, third-party-notice validation, and a runtime dependency audit.

See [CONTRIBUTING.md](CONTRIBUTING.md), [BUILDING.md](BUILDING.md), [SECURITY.md](SECURITY.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), [STORE_LISTING.md](STORE_LISTING.md), and [CHANGELOG.md](CHANGELOG.md).

## License and trademarks

The project is available under the [MIT License](LICENSE). Pascal Glaser's original copyright notice is retained, and HyperCriSiS's later changes are identified separately.

Third-party license texts are generated into [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and shipped in both browser packages.

Pi-hole is a trademark of Pi-hole, LLC. AdGuard is a trademark of Adguard Software Limited. Raspberry Pi is a trademark of Raspberry Pi Ltd. Their names are used only to identify compatibility or inherited artwork under review. No affiliation or endorsement is implied.
