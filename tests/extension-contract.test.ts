import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Baseline contract before WXT migration. When the framework changes, adapt
// where manifests are loaded; do not weaken these browser-facing assertions.
const chromeManifest = JSON.parse(
  readFileSync(new URL('../manifest.chrome.json', import.meta.url), 'utf8'),
)
const firefoxManifest = JSON.parse(
  readFileSync(new URL('../manifest.firefox.json', import.meta.url), 'utf8'),
)

const commandIds = [
  'hotkey-blacklist-current-domain',
  'hotkey-open-settings',
  'hotkey-toggle-pihole',
  'hotkey-whitelist-current-domain',
]

const requiredPermissions = [
  'activeTab',
  'alarms',
  'contextMenus',
  'storage',
]

test('browser toolbar popup, options, version and shortcuts keep parity', () => {
  assert.equal(chromeManifest.action.default_popup, 'popup.html')
  assert.equal(firefoxManifest.browser_action.default_popup, 'popup.html')
  assert.equal(chromeManifest.options_page, 'options.html')
  assert.equal(firefoxManifest.options_ui.page, 'options.html')
  assert.equal(firefoxManifest.options_ui.open_in_tab, true)
  assert.equal(chromeManifest.version, firefoxManifest.version)

  for (const manifest of [chromeManifest, firefoxManifest]) {
    assert.deepEqual(Object.keys(manifest.commands).sort(), commandIds)
  }
})

test('Chrome MV3 and Firefox MV2 retain their distinct background lifecycles', () => {
  assert.equal(chromeManifest.manifest_version, 3)
  assert.equal(chromeManifest.background.service_worker, 'service-worker.js')
  assert.equal(chromeManifest.background.type, 'module')
  assert.equal(firefoxManifest.manifest_version, 2)
  assert.equal(firefoxManifest.background.persistent, true)
  assert.equal(firefoxManifest.background.page, 'background.html')
})

test('permissions and Firefox 140+ declarations do not silently drift', () => {
  assert.deepEqual(
    [...chromeManifest.permissions].sort(),
    requiredPermissions,
  )
  assert.deepEqual(
    firefoxManifest.permissions
      .filter((permission: string) => permission !== '<all_urls>')
      .sort(),
    requiredPermissions,
  )
  assert.ok(firefoxManifest.permissions.includes('<all_urls>'))
  assert.deepEqual(
    [...chromeManifest.host_permissions].sort(),
    ['http://*/*', 'https://*/*'],
  )
  assert.equal(
    firefoxManifest.browser_specific_settings.gecko.id,
    'wormhole-connector@hypercrisis.dev',
  )
  assert.equal(
    firefoxManifest.browser_specific_settings.gecko.strict_min_version,
    '140.0',
  )
  assert.deepEqual(
    [...firefoxManifest.browser_specific_settings.gecko.data_collection_permissions.required].sort(),
    ['authenticationInfo', 'browsingActivity'],
  )
})

test('browser extension pages keep self-only CSP with no unsafe evaluation', () => {
  const policies = [
    chromeManifest.content_security_policy.extension_pages,
    firefoxManifest.content_security_policy,
  ]
  for (const policy of policies) {
    assert.match(policy, /script-src 'self'/)
    assert.doesNotMatch(policy, /unsafe-eval|unsafe-inline|https?:\/\//)
  }
})
