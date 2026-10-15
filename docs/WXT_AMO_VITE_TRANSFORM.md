# AMO DOM hardening: Vite transport contract

This proof-of-concept belongs to [#94](https://github.com/The-Wormhole-Suite/wormhole-connector/issues/94). It **does not** replace Webpack, enable WXT builds, or validate a browser.

- `scripts/loaders/amo-safe-dom-loader.cjs` remains the **single source of truth** for the already-shipped exact-match Vue/Vuetify source rewrites.
- `scripts/loaders/amo-safe-dom-vite-plugin.cjs` exposes those same rewrites as a Vite pre-transform. Its target detection is limited to the two known upstream module paths, including Windows separators or Vite query suffixes. Any changed target source fails the build rather than being silently skipped.
- The plugin excludes `vue`, `@vue/runtime-dom`, and `vuetify` from Vite dependency prebundling, because optimized dependencies can bypass Vite's transform hook. This needs **real WXT/Vite build and HMR validation**; the exclusion list alone is not sufficient proof.
- Production builds that include the Vue/Vuetify UI must observe **both** transforms or fail the `generateBundle` gate. An explicitly background-only build may use `createAmoSafeDomVitePlugin({ requireBothTargets: false })`, but never silently disable the UI check.
- `tests/amo-safe-dom-vite-plugin.test.mjs` exercises the happy path, missing/mutated upstream sources, unrelated imports and dependency-ID variants. `npm test` discovers the file automatically.

**Next phase before merging WXT:** Select and lock a WXT + Vue module version, install from a reproducible lockfile, configure Vite to use the plugin, run **both actual browser builds** and inspect generated artifacts for remaining DOM sinks, manifest parity, AMO lint, legal files and full UI operability. Actual Firefox/Chromium and Pi-hole/AdGuard tests remain mandatory (#61/#98); a passing Node unit test is not browser evidence.

No third-party runtime dependencies are introduced by this preflight PR. Historical candidate remains frozen.
