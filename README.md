<p align="center">
  <img src="icon_raw/icon-raw.png" alt="Pi-hole Browser Extension logo" width="240">
</p>

<h1 align="center">Pi-hole Browser Extension</h1>

<p align="center">
  <a href="https://github.com/HyperCriSiS/pihole-browser-extension/releases"><img src="https://img.shields.io/github/v/release/HyperCriSiS/pihole-browser-extension?include_prereleases&amp;sort=semver" alt="Latest release"></a>
  <a href="https://github.com/HyperCriSiS/pihole-browser-extension/actions/workflows/lint.yml"><img src="https://github.com/HyperCriSiS/pihole-browser-extension/actions/workflows/lint.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HyperCriSiS/pihole-browser-extension" alt="MIT license"></a>
</p>

Control Pi-hole directly from Firefox or a Chromium-based browser without opening the Pi-hole administration interface. The extension targets **Pi-hole v6 and later** and provides global, domain-specific and client-group-specific controls.

## Further Development of the Original Project

This project is an actively maintained continuation of the original [Pi-hole Browser Extension by Pascal Glaser](https://github.com/badsgahhl/pihole-browser-extension).

The original project is now in maintenance mode. Since I use the extension extensively myself, I have modernized the codebase, added numerous features and continue development in this repository.

## Features

### Pi-hole and domain controls

- Enable or disable filtering on the configured Pi-hole instances.
- See whether the current domain is blocked globally.
- Add the current domain to the global whitelist or blacklist.
- Configure one or more Pi-hole connections.
- Optionally reload the current tab after disabling filtering or whitelisting a domain.

### Client-group actions

- Select a Pi-hole client group directly in the popup.
- See whether the current domain is blocked for the selected group.
- Assign whitelist or blacklist rules specifically to the selected group.
- Temporarily whitelist the current domain for configurable durations.
- Enable, disable or temporarily pause filtering for the selected group.
- Use the selected group's domain status for the toolbar badge.

### Customization and shortcuts

- Keep the extension logo recognizable and show active, blocked, temporarily allowed, disabled and error/unknown states through a native, color-coded toolbar badge.
- Configure the three presets used for temporary domain whitelisting and group pauses.
- Hide the client-group selector or individual action sections from the popup.
- Use keyboard shortcuts and browser context-menu actions.
- Check saved Pi-hole connections from the settings page.
- Follow the browser's light or dark appearance.

### Toolbar status

The toolbar keeps the large, shield-free main logo visible and uses the browser's native badge for status information:

| Badge | Meaning |
| --- | --- |
| Green `✓` | Pi-hole is active and the current domain is allowed |
| Red `×` | The current domain is blocked |
| Orange time, for example `5m` | The current domain is temporarily allowed |
| Blue-grey `OFF` | Pi-hole filtering is disabled |
| Yellow `!` | The current status is unavailable or an error occurred |

## Requirements

- Pi-hole v6 or later.
- Firefox or a Chromium-based browser.
- Network access from the browser to the configured Pi-hole address.
- A valid Pi-hole web-interface password when authentication is enabled.

## Installation

Download the package for your browser from the [GitHub Releases](https://github.com/HyperCriSiS/pihole-browser-extension/releases) page.

### Chromium-based browsers

1. Download and extract the `chrome.zip` package.
2. Open the browser's extensions page, for example `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the extracted directory.

### Firefox

The release currently contains an unsigned Firefox package for testing. In Firefox, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on** and choose the downloaded XPI file. Temporary add-ons are removed when Firefox closes. A permanent installation in standard Firefox requires a Mozilla-signed package.

## Setup

1. Open the extension popup and select the cog button.
2. Enter the complete Pi-hole address, including `http://` or `https://` and any required path.
3. Enter the Pi-hole web-interface password.
4. Save the connection and verify it with the connection check.
5. Optionally select a default client group and customize the popup, toolbar badge and timer presets.

Multiple Pi-hole instances are supported, but combined behavior can vary with the network and Pi-hole configuration. Test the intended actions before relying on a multi-instance setup.

## Privacy and permissions

Pi-hole addresses, passwords and extension preferences are stored in the browser's local extension storage. They are not placed in browser synchronization storage.

The extension requires access to HTTP and HTTPS addresses so it can communicate with user-configured Pi-hole instances, including devices hosted on local network addresses. Access to the active tab is used to identify the current domain for status checks and list actions. Context-menu and alarm permissions support the corresponding shortcuts and temporary actions.

To perform its core functions, the extension sends the configured authentication information and the current domain to the Pi-hole addresses you provide. It does not send this information to the developers, analytics services or unrelated third parties. See the complete [privacy policy](PRIVACY).

## Troubleshooting

### A switch or action reports an error

Check the saved Pi-hole address and password for whitespace or an incorrect path, then run the connection check from the settings page. The browser must be able to reach the Pi-hole address directly.

### Domain status is unknown

A status can only be determined when the current page has a usable domain, the Pi-hole connection succeeds and the required lists or group assignments can be read. Internal browser pages do not expose a normal web domain.

### Group actions are unavailable

Save and verify a working Pi-hole v6 connection first. The selected client group must exist on every Pi-hole instance involved in the action.

## Development

The project uses Vue, TypeScript, Vuetify, Webpack and npm. Node.js versions 22 through 24 are supported.

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run check
```

`npm run check` performs the complete TypeScript, lint, formatting, test and browser-build validation used by CI. See [CONTRIBUTING.md](CONTRIBUTING.md) for development details.

## Contributors

- [Pascal Glaser](https://github.com/badsgahhl)
- [Erik Rill](https://github.com/erikr729)
- [HyperCriSiS](https://github.com/HyperCriSiS)

## License

This project is available under the [MIT License](LICENSE).

## Disclaimer

This is not an official Pi-hole application. Report extension problems in this repository; the Pi-hole project is not responsible for malfunctions caused by this extension.
