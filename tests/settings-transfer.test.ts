import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createImportPlan,
  createSettingsBackup,
  parseSettingsBackup,
} from '../src/service/SettingsTransferService.ts'
import { ConnectorType } from '../src/service/StorageService.ts'

const localSettings = {
  pi_hole_settings: [
    {
      pi_uri_base: 'https://dns.example.test/reverse/admin/',
      api_key: ' top secret with spaces ',
    },
    {
      connector_type: ConnectorType.adguardHome,
      pi_uri_base: 'https://adguard.example.test/home/',
      username: 'private-admin',
      api_key: 'another secret',
    },
  ],
  default_disable_time: 15,
  group_pause_times: [60, 300, 900],
  temporary_allow_times: [30, 120, 600],
  pause_target: 'Children',
  disable_context_menu: true,
  session_storage_example: { value: 'sid-secret' },
  group_pause_actions_v2: { actions: { private: 'timer-state' } },
}

test('backup exports only versioned non-secret settings', () => {
  const backup = createSettingsBackup(localSettings)
  const serialized = JSON.stringify(backup)

  assert.equal(backup.format, 'wormhole-connector-settings')
  assert.equal(backup.schemaVersion, 2)
  assert.deepEqual(backup.settings.addresses.connectors, [
    {
      type: ConnectorType.piHole,
      address: 'https://dns.example.test/reverse/admin',
    },
    {
      type: ConnectorType.adguardHome,
      address: 'https://adguard.example.test/home',
    },
  ])
  assert.equal(serialized.includes('top secret'), false)
  assert.equal(serialized.includes('private-admin'), false)
  assert.equal(serialized.includes('another secret'), false)
  assert.equal(serialized.includes('sid-secret'), false)
  assert.equal(serialized.includes('timer-state'), false)
})

test('import preserves local passwords only for matching normalized addresses', () => {
  const backup = createSettingsBackup(localSettings)
  backup.settings.addresses.connectors.push({
    type: ConnectorType.adguardHome,
    address: 'https://second.example.test/adguard',
  })

  const plan = createImportPlan(backup, [
    {
      pi_uri_base: 'https://dns.example.test/reverse/admin',
      api_key: ' keep this password ',
    },
    {
      connector_type: ConnectorType.adguardHome,
      pi_uri_base: 'https://adguard.example.test/home',
      username: 'keep-user',
      api_key: 'keep-adguard-password',
    },
  ])

  assert.deepEqual(plan.set.pi_hole_settings, [
    {
      connector_type: ConnectorType.piHole,
      pi_uri_base: 'https://dns.example.test/reverse/admin',
      api_key: ' keep this password ',
    },
    {
      connector_type: ConnectorType.adguardHome,
      pi_uri_base: 'https://adguard.example.test/home',
      username: 'keep-user',
      api_key: 'keep-adguard-password',
    },
    {
      connector_type: ConnectorType.adguardHome,
      pi_uri_base: 'https://second.example.test/adguard',
      api_key: '',
      username: '',
    },
  ])
})

test('backup parser rejects unknown fields, schema versions, and duplicate URLs', () => {
  const backup = createSettingsBackup(localSettings)

  assert.throws(() => parseSettingsBackup({ ...backup, surprise: true }))
  assert.throws(() => parseSettingsBackup({ ...backup, schemaVersion: 3 }))
  assert.throws(() =>
    parseSettingsBackup({
      ...backup,
      settings: {
        ...backup.settings,
        addresses: {
          connectors: [
            {
              type: ConnectorType.piHole,
              address: 'https://dns.example.test/admin',
            },
            {
              type: ConnectorType.piHole,
              address: 'https://dns.example.test/admin/',
            },
          ],
        },
      },
    }),
  )

  assert.doesNotThrow(() =>
    parseSettingsBackup({
      ...backup,
      settings: {
        ...backup.settings,
        addresses: {
          connectors: [
            {
              type: ConnectorType.piHole,
              address: 'https://dns.example.test',
            },
            {
              type: ConnectorType.adguardHome,
              address: 'https://dns.example.test',
            },
          ],
        },
      },
    }),
  )
})

test('schema version 1 Pi-hole backups migrate to connector descriptors', () => {
  const backup = createSettingsBackup(localSettings)
  const migrated = parseSettingsBackup({
    ...backup,
    schemaVersion: 1,
    settings: {
      ...backup.settings,
      addresses: {
        piHoleAddresses: ['https://dns.example.test/reverse/admin/'],
      },
    },
  })

  assert.equal(migrated.schemaVersion, 2)
  assert.deepEqual(migrated.settings.addresses.connectors, [
    {
      type: ConnectorType.piHole,
      address: 'https://dns.example.test/reverse/admin',
    },
  ])
})
