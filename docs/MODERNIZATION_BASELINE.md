# Modernization baseline and regression contract

Status: baseline captured on 2026-10-14 before WXT and API SDK migration.
Source reference: `dev` commit `ecb3712a1d2105445178641687afc31663a201fc`.
Tracks #93 / epic #92. This is an inventory of existing behavior, **not** evidence that the new SDKs or WXT have passed any test.

## Architectural boundary

Current dependency direction:

`src/module/popup` and `src/module/option` (Vue/Vuetify) → shared actions in `src/service/ConnectorApiService.ts`, `ConnectorScopeDomainService.ts`, `ConnectorScopePauseService.ts`, `DomainStatusService.ts` → Pi-hole and AdGuard service implementations → axios/fetch → remote HTTP APIs.

- Reuse the existing domain-level methods for compatibility; **no Vue component should call pihole-js, generated AdGuard operations, or raw remote HTTP directly**.
- `src/service/OperationCoordinator.ts` provides ordered keyed locks: `navigator.locks` across contexts when available, otherwise **only a local in-process Map**. Do not assume browser-wide exclusion under the fallback: migrate with a test of actual cross-context behavior.
- `src/service/MultiInstanceOperation.ts` preflights all targets, performs writes sequentially, and reverses completed writes on failure. Preserve error stages and recovery visibility; do not claim the rollback is an atomic backend transaction.
- Freeze the historic candidate at `87bb4677b08951d53406c3f246d8efb1328f6904`. New release evidence must refer to the **new** exact tested SHA (#61 and #98).

## Current Pi-hole v6 API contract

Owner: `src/service/PiHoleApiService.ts`, URL normalization: `src/service/PiHoleUrl.ts`, Pi-hole DTOs in `src/api/models/PiHole*.ts`.

| HTTP method and relative API endpoint | Public behavior / source API | Required parity |
| --- | --- | --- |
| GET `dns/blocking` | `getPiHoleStatusFor`, aggregated status | enabled / disabled / mixed / failures |
| POST `dns/blocking` | `setPiHoleStatusFor`, `changePiHoleStatus` | duration units, null duration, rollback |
| GET `info/version` | `getPiHoleVersion`, connection test | Core / FTL / Web version information |
| POST `auth` | `acquireSession` | preserve password **without trimming**, passwordless support |
| DELETE `auth` | `endSession`, `endSessions` | close remote sessions, discard local SID even on logout failure |
| GET `groups` / GET `groups/{name}` | `getGroups` / `getGroup` | matching by **name** across servers, 404 = missing |
| PUT `groups/{name}` | `replaceGroup` | preserve group name/comment/enabled and server-specific ID |
| GET/POST/PUT/DELETE `domains/{list}/{kind}[/{domain}]` | exact and regex domain CRUD | encode path segments correctly; response shapes and 404 |
| GET `search/{domain}?partial=false&N=100` | `searchDomain` | exact search and URL encoding |

`getPiHoleApiBase` converts root, `/admin`, `/api` and custom reverse-proxy prefixes to one API base. The SDK adapter must retain this *before* creating a pihole-js client; the library must not receive an ambiguous user-entered base URL.

Pi-hole SID specifics: `StorageService.getSid/saveSid/removeSid` use `chrome.storage.session` (fallback in-memory only if unsupported). `getOrCreateSid` and `refreshSid` acquire the keyed coordination lock. `authenticationRequests` deduplicates pending authentications. API requests use `X-FTL-SID` today and retry once after a 401. The pihole-js session store / default auth flow may replace HTTP calls **only after** demonstrating that it keeps all these invariants. Existing local connection passwords never belong in browser sync/export.

## Current AdGuard Home HTTP contract

Owner: `src/service/AdGuardHomeApiService.ts`, domain transformation: `src/service/AdGuardHomeRules.ts`, URL base: `getAdGuardHomeApiBase` in `ConnectorUrl.ts`, DTOs in `src/api/models/AdGuardHome.ts`.

| HTTP method and `/control/` endpoint | Public behavior / source API | Required parity |
| --- | --- | --- |
| GET `status` | `getStatusFor` / connection version check | running, version >= 0.107.58, protection state |
| POST `protection` | `setProtectionFor` | pause duration **seconds → milliseconds**, read-back |
| GET `filtering/check_host` | `getDomainStatusFor` | global and optional client-specific result |
| GET `filtering/status` | `getUserRules` | preserve every foreign rule and exact ordering |
| POST `filtering/set_rules` | `applyRuleMutation`, `restoreRuleMutation` | read/compare/write/read-back, conditional rollback |
| GET `clients` | `getClients` / `getClient` | persistent client names, settings and IDs |
| POST `clients/update` | `applyClientMutation` / `restoreClientMutation` | compare current client before change, read-back |

The client must support Basic Auth without changing credential whitespace, default and custom reverse-proxy prefixes, and preserve errors. `filtering/set_rules` replaces the **entire** custom ruleset, so the current guard is important but **not server-atomic**: foreign edits between the compare and write can still race.

Generate the **complete official AdGuard Home SDK**, not only operations above, from a pinned OpenAPI revision; keep generated code behind the adapter, with deterministic generation and a drift-only monitoring check. Confirm generator support for the current spec's OpenAPI 3.2 syntax against the supported server baseline.

## Shared multi-backend contracts

| Shared feature | Owning code | Behavior to retain |
| --- | --- | --- |
| Validate/store up to 4 unique connectors | `StorageService.ts`, `ConnectorTypes.ts`, `ConnectorUrl.ts` | backend type + normalized address identity; AdGuard username and secrets stay local |
| Read/test global status | `ConnectorApiService.ts` | combined Pi-hole + AdGuard status, explicit error and mixed states |
| Global protection write | `ConnectorApiService.changeProtection` | preflight, keyed lock, rollback |
| Global and scoped domain actions | `ConnectorApiService`, `ConnectorScopeDomainService.ts` | normal/allow/block, missing scopes, AdGuard native rules vs Pi-hole groups |
| Common scopes across servers | `ConnectorApiService.getCommonScopes` | **name matching**, different numeric Pi-hole IDs |
| Scoped protection pause | `ConnectorApiService.setScopeState`, `ConnectorScopePauseService.ts` | AdGuard persistent client / Pi-hole group equivalence; explicit mixed |
| Timed actions and restart | `TemporaryActionService.ts`, `GroupPauseService.ts`, `GroupDomainService.ts`, `ConnectorScope*Service.ts` | expiration, concurrent timers, alarms, restore only if still expected |
| Settings migration, backups and sync | `StorageService.ts`, `SettingsTransferService.ts`, `BrowserSyncService.ts` | legacy format migration; category-specific sync; **never** sync or export passwords/SIDs |
| Badge and contextual state | `BadgeService.ts`, `BadgeState.ts`, `DomainStatusService.ts` | active-tab status, mixed and unknown, icon refresh |

The current Web Locks fallback is not an inter-context lock. Keep this as an explicit risk and regression scenario when Chrome background service workers restart or requests originate from multiple contexts.

## Browser and UI manifest parity

Current source manifests are `manifest.chrome.json` and `manifest.firefox.json`; the added `tests/extension-contract.test.ts` captures their current stable interfaces as a **migration red-line test**. Adjust its fixture/loading logic when moving manifests under WXT, **never silently remove its semantic assertions**.

| Contract | Chrome (current) | Firefox (current) |
| --- | --- | --- |
| Manifest | MV3 | MV2 |
| Background | module service worker `service-worker.js` | persistent `background.html` |
| Toolbar popup | `action.default_popup = popup.html` | `browser_action.default_popup = popup.html` |
| Options | `options_page = options.html` | `options_ui.page = options.html` |
| Host access | `http://*/*`, `https://*/*` | `<all_urls>` |
| Core permissions | storage, activeTab, contextMenus, alarms | same |
| Four command IDs | toggle protection, blacklist, whitelist, open settings | same |
| Extension CSP | own scripts only, no remote code | same |
| Firefox disclosure | N/A | Gecko >=140, `authenticationInfo` and `browsingActivity` collection permissions |
| Gecko extension ID | N/A | `wormhole-connector@hypercrisis.dev` |

Browser integration owners: `src/module/background/background.ts` → `BackgroundInitializer.ts` initializes `ContextMenuInitializer`, `ChromeRuntimeInitializer`, `HotKeyInitializer`; tab listeners, storage listeners, badge alarm and five timed-action handlers. `BrowserSyncService.initialize` hooks the storage changes. Preserve registration timing for MV3 worker lifecycles.

Popup **must remain** a native browser toolbar popup, not be converted to a tab-only app:
- `src/module/popup/vue/view/PopupComponent.vue`: connection settings, active URL, common scope chooser and status rendering.
- `PopupGlobalControlComponent.vue`: mixed/global protection, errors and partial failure details.
- `PopupListCardComponent.vue`: allow/block current domain globally or per scope and temporary allow.
- `PopupStatusCardComponent.vue`: group/scope protection, pause presets and recovery state.
- `src/module/option/vue/views/OptionSettingsView.vue` and `OptionBackupSyncComponent.vue`: connectors, timers, hotkeys, settings export/preview/import and four opt-in sync categories.

Preserve current eight locales, keyboard/assistive behavior and **320px popup** sizing when replacing UI, and keep the six cross-project Suite themes in a separate shared design effort; new base components must be theme-token-ready.

## Build and security invariants

Current toolchain: Node >=22 <25, Vue 3, Vuetify 4, TypeScript 6, Webpack 5 (version details in `package.json`/lockfile). `src/webpack/WebpackConfigFactory.ts` builds Firefox and Chrome separately and copies manifests, icons/locales, legal files and source references.

Critical migration obstacle: `scripts/loaders/amo-safe-dom-loader.cjs` transforms parts of Vue/Vuetify's DOM behavior for AMO. A WXT/Vite build must reproduce this security property **or demonstrate a safe alternative** and pass AMO lint + actual Firefox validation. Do not remove it without evidence.

`scripts/validate-packages.mjs` checks browser package contents. Keep release version synchronization, checksums, ZIP/XPI, source archive, `LICENSE.txt`, `NOTICE.txt`, `CREDITS.txt`, `PRIVACY.txt` and `THIRD_PARTY_NOTICES.txt`. Existing immutable SHA-pinned Actions and minimized CI execution should remain. Third-party `pihole-js` MIT notices and legal obligations for a spec-derived AdGuard SDK must be reviewed.

## Regression matrix and exit gates

| Scenario / contract | Existing automated evidence to reuse | Additional acceptance |
| --- | --- | --- |
| Pi-hole URL root/admin/api/prefix | `tests/pihole-url.test.ts`; `tests/live-url-shapes.integration.ts` | actual user proxy and Firefox HTTP |
| Pi-hole auth, expiry, 401 retry, spaces, logout | `tests/live-backends.integration.ts`; `tests/live-pihole-failures.integration.ts`; `tests/storage-service.test.ts` | pihole-js parity across contexts and MV3 restarts |
| Pi-hole exact/regex lists and independent group IDs | `tests/connector-api.test.ts`; `tests/live-backends.integration.ts` | actual multi-Pi-hole target |
| AdGuard URL, global pause, per-client rules | `tests/connector-url.test.ts`; `tests/adguard-home.test.ts`; `tests/live-backends.integration.ts` | full generator compatibility and real Home |
| AdGuard concurrent custom rules | `tests/adguard-home.test.ts`; `tests/live-backends.integration.ts` | foreign writer between read and write; document TOCTOU |
| Partial writes, rollback and recovery | `tests/multi-instance-operation.test.ts`; `tests/connector-recovery.test.ts`; `tests/group-recovery.test.ts` | offline backend, manual restoration |
| Alarms, timers, browser restarts | `tests/temporary-action-recovery.test.ts`; `tests/group-recovery.test.ts` | real Firefox and Chrome restart |
| Local password, no sync/export secrets | `tests/settings-transfer.test.ts`; `tests/browser-sync.test.ts`; `tests/storage-service.test.ts` | file export/import and browser profile sync |
| Popup/options, browser commands/permissions | `tests/context-menu.test.ts`; **new** `tests/extension-contract.test.ts` | visual/browser manual parity and permission consent |
| Package/release/legal files | `tests/release-version.test.mjs`; `scripts/validate-packages.mjs`; full CI | generated WXT packages, AMO lint, source/checksums |

**Stop / rollback conditions:** any leaked SID or password in sync/export; permission expansion without review; dropped browser command, native popup or import/export path; loss of Web Locks/session coordination; broken fallback on unsupported browsers; unhandled foreign AdGuard rules; regression in reverse proxies; missing AMD/AMO review requirements; unverified new runtime dependency/license; regressions in mixed-state/rollback, timers or background restart.

**Promotion policy:** make reviewable PRs for WXT (#94), pihole-js (#95), AdGuard generation (#96) and UI (#97). Each passes relevant tests at exact SHA before merge. Only #98 can requalify a *new* release candidate. Manual browser and real-system evidence in #61 cannot be inferred from container tests.
