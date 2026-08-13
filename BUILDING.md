# Building Wormhole Connector

## Environment

- Ubuntu 24.04 or a comparable Linux environment
- Node.js 22
- npm with lockfile-version 3 support
- Git

Build the exact submitted tag or commit. Do not regenerate `package-lock.json` during a verification build.

```bash
npm ci --no-audit --no-fund
npm run check
```

The production outputs are created in:

- `dist/firefox`
- `dist/chrome`
- `package.firefox.zip`
- `package.chrome.zip`

Prepare store-ready names, checksums, and the matching source archive with:

```bash
npm run package:artifacts
```

`THIRD_PARTY_NOTICES.txt` is generated from the locked dependency graph. If dependencies intentionally change, run:

```bash
npm run notices:generate
```

The complete validation command verifies TypeScript and Vue templates, linting, formatting, locale completeness, tests, both production builds, Mozilla package linting, package contents, license notices, and the runtime dependency audit.

For Mozilla review, the checked-in `scripts/loaders/amo-safe-dom-loader.cjs` build transform replaces dependency fallbacks with safer DOM APIs. Vue's compiled-static-template parser uses an inert `DOMParser` document, dynamic `innerHTML` template properties are disabled because Wormhole Connector does not use `v-html`, and Vuetify writes generated CSS through `textContent`. The transform requires exactly one known source match and deliberately fails the build after an incompatible dependency update.

The generated ZIP files can contain archive timestamp differences between environments. The source, dependency versions, manifest contents, and produced extension code are determined by the tagged commit and `package-lock.json`.
