# WXT/Vite migration: browser and AMO safety gates

Status: migration preflight, not evidence of a successful WXT build. Tracks [#94](https://github.com/The-Wormhole-Suite/wormhole-connector/issues/94) and modernization epic #92. Base source: `dev` commit `d0707a2943f8e262f2bbc2d2e4d94e5c808518cf` (2026-10-14).

## Non-negotiable extension outputs

| Output | Chrome MV3 | Firefox MV2 | Source today |
| --- | --- | --- | --- |
| toolbar popup | `action.default_popup = popup.html` | `browser_action.default_popup = popup.html`, `browser_style = true` | `src/module/popup/popup.html`, `popup.ts` |
| Options | `options_page = options.html` | `options_ui.page = options.html`, `open_in_tab = true` | `src/module/option/options.html`, `options.ts` |
| Background | `service-worker.js` ES module | persistent `background.html` page loading a script | `src/module/background/background.ts` + HTML |
| Host access | `host_permissions: http://*/*, https://*/*` | `<all_urls>` in `permissions` | browser manifests |
| Commands | four unchanged hotkey IDs | same four hotkey IDs | manifest files, `HotKeyInitializer.ts` |
| Browser permissions | storage, activeTab, contextMenus, alarms | same plus host | manifest files |
| Security/locales | self-only CSP | self-only CSP; Gecko ID and Firefox 140+ data consent | manifests, `_locales` |
| Distribution | packaged Chrome ZIP | AMO-lintable unsigned Firefox XPI and matching source archive | `scripts/prepare-artifacts.mjs`, `scripts/validate-packages.mjs` |

All resulting manifests need output-level assertions, not just source-level assertions. Do not let WXT defaults silently change permission grants, browser IDs, locale substitution, URL schemes, update/version counters, context menus or background lifecycle. Existing `tests/extension-contract.test.ts` protects the source manifests; replace or augment these assertions only **after** validating generated manifests for both browsers.

## AMO-safe DOM transform: critical blocker

Current `scripts/loaders/amo-safe-dom-loader.cjs` rewrites exact source fragments **inside dependencies**, not our own Vue components:

1. Vue's `@vue/runtime-dom` static template handling moves from `templateContainer.innerHTML` to a `DOMParser` / adoptNode fragment.
2. Vue's dynamic `innerHTML` property write throws; `textContent` uses a safe direct property.
3. Vuetify theme CSS insertion changes `styleEl.innerHTML` to `styleEl.textContent`.

The new `tests/amo-safe-dom-loader.test.ts` makes all three expected properties and the fail-closed exact-source guard executable before migration. **These are only unit tests of the existing Webpack loader**, not proof that WXT/Vite preserves them.

A WXT/Vite path must either (a) implement an equally strict, version-scoped Vite transform with exact-one assertions and artifact-level sink checks or (b) replace affected library behavior through a demonstrably safe, separately audited approach. No generic find/replace that might silently miss changed dependency code. The transform must cover both development and production builds. Version-pin Vue/Vuetify, verify each changed upstream runtime dependency against the transform, check the final Firefox artifact, and run `web-ext lint`.

Potential caveat: `DOMParser` use must not be described as universal HTML sanitization. The transform serves the existing AMO source constraints; independent injection and data-flow review is still required.

## Suggested migration sequence

1. Create an **isolated WXT spike branch** off `dev`; pin a tested WXT/Vite/Vue plugin version and verify real Firefox MV2 plus Chrome MV3 support (including existing HTML-background-page behavior). Do not remove Webpack or rewrite business logic during the spike.
2. Move the three Vue initialization entries into WXT entrypoint conventions without modifying their rendered components, IDs or i18n keys. Test a Firefox background document and Chrome service worker for all runtime listeners, alarms and timers.
3. Port manifests **losslessly**. Retain `browser_specific_settings.gecko`, `gecko_android`, data-collection consent, all four hotkey IDs, `options_ui.open_in_tab`, `browser_action.browser_style` and exact permission sets. Confirm release-version synchronization remains authoritative for both builds.
4. Reproduce the AMO-safe DOM transforms and verify compiled output with an explicit no-regression check. Do not merely remove `amo-safe-dom-loader` on the assumption that Vite will be compliant.
5. Preserve all legally required root and package files: `LICENSE.txt`, `NOTICE.txt`, `CREDITS.txt`, `PRIVACY.txt`, `THIRD_PARTY_NOTICES.txt`; icons and eight locale directories. Make reproducible source archives, hashes and both browser package checks work with WXT's output layout.
6. Keep previous `npm run check`, CI security checks, live Pi-hole/AdGuard tests and minimal workflow frequency. Add actual browser-install smoke evidence before marking #94 done: Firefox 140+, current Chrome/Chromium, popup/options, HTTP Pi-hole and HTTPS/reverse-proxy destinations, timers and restart recovery.
7. Merge a reviewable WXT migration PR only after passing output parity checks, automated CI/live checks, AMO safety review and real-browser gates; otherwise revert to the unchanged Webpack build.

## Gate hierarchy

- **Stage 0:** baseline unit tests + explicit artifact/manifest feature matrix (this document).
- **Stage 1:** isolated WXT build, no release promotion; package-level parity checks and AMO-safe DOM transform.
- **Stage 2:** runtime tests on **actual browsers** and Pi-hole/AdGuard servers, including the real-system gates in #61. Do not infer browser behavior from a Node test or an emulated browser.
- **Stage 3:** full CI and release requalification under #98, exact new SHA. Historical candidate `87bb4677b08951d53406c3f246d8efb1328f6904` stays frozen.

Known special risk: `OperationCoordinator` falls back to a **per-process** lock if Web Locks are unavailable; Chrome's MV3 service-worker restart can expose cross-context races. Keep this as a browser acceptance criterion, not a tested global lock guarantee.
