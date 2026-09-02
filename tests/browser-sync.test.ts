import assert from 'node:assert/strict'
import test from 'node:test'
import BrowserSyncService, {
  SYNC_CATEGORIES,
} from '../src/service/BrowserSyncService.ts'
import PiHoleApiService from '../src/service/PiHoleApiService.ts'
import { SETTINGS_SCHEMA_VERSION } from '../src/service/SettingsTransferService.ts'
import {
  ConnectorType,
  ExtensionStorageEnum,
  StorageService,
  type ConnectorSettingsStorage,
  type SyncPreferences,
} from '../src/service/StorageService.ts'

const enabledPreferences: SyncPreferences = {
  general: true,
  timers: true,
  group: true,
  addresses: true,
}

const piHole: ConnectorSettingsStorage = {
  connector_type: ConnectorType.piHole,
  pi_uri_base: 'https://dns.example.test/reverse/admin',
  api_key: ' pi secret ',
}

const adGuard: ConnectorSettingsStorage = {
  connector_type: ConnectorType.adguardHome,
  pi_uri_base: 'https://adguard.example.test/home',
  username: ' private admin ',
  api_key: ' adguard secret ',
}

test('all enabled sync categories publish without credentials or ephemeral state', async () => {
  const remote: Record<string, unknown> = {}
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        sync: {
          set: async (values: Record<string, unknown>) => {
            Object.assign(remote, values)
          },
        },
      },
    },
  })

  const originals = {
    getSyncPreferences: StorageService.getSyncPreferences,
    getAllLocalValues: StorageService.getAllLocalValues,
  }

  try {
    StorageService.getSyncPreferences = async () => ({ ...enabledPreferences })
    StorageService.getAllLocalValues = async () => ({
      pi_hole_settings: [piHole, adGuard],
      default_disable_time: 15,
      group_pause_times: [60, 300, 900],
      temporary_allow_times: [30, 120, 600],
      pause_target: 'Family',
      hide_group_selector_in_popup: true,
      hide_group_list_actions_in_popup: false,
      badge_uses_selected_group: true,
      reload_after_disable: false,
      reload_after_white_list: true,
      disable_list_feature: false,
      disable_context_menu: true,
      session_storage_example: { value: 'sid-secret' },
      temporary_actions_v1: { domains: { secret: 'timer-recovery-state' } },
    })

    await BrowserSyncService.syncNow()

    assert.deepEqual(
      Object.keys(remote).sort(),
      SYNC_CATEGORIES.map(
        (category) => `wormhole_connector_sync_v2_${category}`,
      ).sort(),
    )

    const serialized = JSON.stringify(remote)
    for (const secret of [
      'pi secret',
      'private admin',
      'adguard secret',
      'sid-secret',
      'timer-recovery-state',
    ]) {
      assert.equal(serialized.includes(secret), false, secret)
    }

    const addresses = remote.wormhole_connector_sync_v2_addresses as {
      data: { connectors: Array<{ type: ConnectorType; address: string }> }
    }
    assert.deepEqual(addresses.data.connectors, [
      {
        type: ConnectorType.piHole,
        address: 'https://dns.example.test/reverse/admin',
      },
      {
        type: ConnectorType.adguardHome,
        address: 'https://adguard.example.test/home',
      },
    ])
  } finally {
    StorageService.getSyncPreferences = originals.getSyncPreferences
    StorageService.getAllLocalValues = originals.getAllLocalValues
  }
})

test('address sync preserves matching local credentials and clears Pi-hole sessions', async () => {
  const originals = {
    getSyncPreferences: StorageService.getSyncPreferences,
    getPiHoleSettingsArray: StorageService.getPiHoleSettingsArray,
    setLocalValues: StorageService.setLocalValues,
    removeAllSids: StorageService.removeAllSids,
    endSessions: PiHoleApiService.endSessions,
  }
  let applied: Record<string, unknown> | undefined
  let sessionsCleared = 0
  let ended: ConnectorSettingsStorage[] = []

  try {
    StorageService.getSyncPreferences = async () => ({ ...enabledPreferences })
    StorageService.getPiHoleSettingsArray = async () => [piHole, adGuard]
    StorageService.setLocalValues = async (values) => {
      applied = values
    }
    StorageService.removeAllSids = async () => {
      sessionsCleared += 1
    }
    PiHoleApiService.endSessions = async (instances) => {
      ended = [...instances]
    }

    await BrowserSyncService.handleSyncChanges({
      wormhole_connector_sync_v2_addresses: {
        newValue: {
          schemaVersion: SETTINGS_SCHEMA_VERSION,
          updatedAt: new Date().toISOString(),
          data: {
            connectors: [
              {
                type: ConnectorType.piHole,
                address: 'https://dns.example.test/reverse/admin/',
              },
              {
                type: ConnectorType.adguardHome,
                address: 'https://adguard.example.test/home/',
              },
              {
                type: ConnectorType.adguardHome,
                address: 'https://new.example.test/control',
              },
            ],
          },
        },
      } as chrome.storage.StorageChange,
    })

    assert.deepEqual(ended, [piHole])
    assert.equal(sessionsCleared, 1)
    assert.deepEqual(applied?.[ExtensionStorageEnum.pi_hole_settings], [
      piHole,
      adGuard,
      {
        connector_type: ConnectorType.adguardHome,
        pi_uri_base: 'https://new.example.test/control',
        username: '',
        api_key: '',
      },
    ])
  } finally {
    StorageService.getSyncPreferences = originals.getSyncPreferences
    StorageService.getPiHoleSettingsArray = originals.getPiHoleSettingsArray
    StorageService.setLocalValues = originals.setLocalValues
    StorageService.removeAllSids = originals.removeAllSids
    PiHoleApiService.endSessions = originals.endSessions
  }
})
