# Reviewer notes

The submitted Wormhole Connector XPI is intentionally unsigned and is intended to be signed by Mozilla.

A matching source archive from the same Git commit is provided. The exact commit is recorded in `SOURCE_COMMIT.txt` inside that archive.

## Build environment

- Ubuntu 24.04 or a comparable Linux environment
- Node.js 22
- npm

```bash
npm ci --no-audit --no-fund
npm run build:firefox
```

The Firefox output is created in `dist/firefox`. The complete validation suite is:

```bash
npm run check
```

The extension contains bundled TypeScript, Vue runtime-only code, Vuetify, Axios, and related dependencies installed from the official npm registry according to `package-lock.json`. It does not download or execute remote code. Generated third-party notices are included in the package.

The reproducible build applies the checked-in `scripts/loaders/amo-safe-dom-loader.cjs` transform to dependency fallbacks. Vue's static-template path parses into an inert `DOMParser` document, Vue's dynamic `innerHTML` template property is disabled because the extension does not use `v-html`, and Vuetify's generated theme CSS uses `textContent`. Each replacement is exact and makes the build fail if a dependency update changes the reviewed source block.

All extension network requests are directed to Pi-hole v6 or AdGuard Home addresses explicitly configured by the user. A reviewer needs access to their own supported DNS server; there is no developer-operated service or shared test account.

The manifest declares `authenticationInfo` and `browsingActivity` because user-provided credentials and the current tab's domain are transmitted to the configured DNS connector as part of the extension's primary function. Neither category is transmitted to the developer.

Optional browser synchronization is off by default and is limited to categories explicitly enabled by the user. Passwords, application passwords, session identifiers, CSRF values, and temporary-action recovery data are excluded by construction.
