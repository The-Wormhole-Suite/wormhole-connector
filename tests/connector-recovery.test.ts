import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList.ts'
import type { PiHoleDomain } from '../src/api/models/PiHoleDomains.ts'
import type { PiHoleGroup } from '../src/api/models/PiHoleGroups.ts'
import ConnectorApiService, {
  type ConnectorDomainMutation,
  type ConnectorScopeMutation,
} from '../src/service/ConnectorApiService.ts'
import ConnectorScopeDomainService from '../src/service/ConnectorScopeDomainService.ts'
import ConnectorScopePauseService from '../src/service/ConnectorScopePauseService.ts'
import { getConnectorIdentity } from '../src/service/ConnectorUrl.ts'
import {
  ConnectorType,
  type ConnectorSettingsStorage,
} from '../src/service/StorageService.ts'

const piHole: ConnectorSettingsStorage = {
  connector_type: ConnectorType.piHole,
  pi_uri_base: 'https://pi.example.test/admin',
  api_key: 'pi-password',
}

const adGuard: ConnectorSettingsStorage = {
  connector_type: ConnectorType.adguardHome,
  pi_uri_base: 'https://adguard.example.test',
  username: 'admin',
  api_key: 'adguard-password',
}

const domain = (groups: number[]): PiHoleDomain => ({
  domain: 'example.org',
  unicode: 'example.org',
  type: ApiList.whitelist,
  kind: 'exact',
  comment: 'From Wormhole Connector',
  groups,
  enabled: true,
  id: 1,
  date_added: 0,
  date_modified: 0,
})

const group = (enabled: boolean): PiHoleGroup => ({
  name: 'Kids',
  comment: null,
  enabled,
  id: 7,
  date_added: 0,
  date_modified: 0,
})

const piHoleDomainMutation: ConnectorDomainMutation = {
  backend: ConnectorType.piHole,
  list: ApiList.whitelist,
  oppositeList: ApiList.blacklist,
  domain: 'example.org',
  originalTarget: null,
  originalOpposite: null,
  expectedTarget: domain([7]),
  expectedOpposite: null,
}

const adGuardDomainMutation: ConnectorDomainMutation = {
  backend: ConnectorType.adguardHome,
  originalRules: [],
  expectedRules: ["@@||example.org^$client='Kids'"],
  allowRule: "@@||example.org^$client='Kids'",
  blockRule: "||example.org^$client='Kids'",
}

const piHoleScopeMutation: ConnectorScopeMutation = {
  backend: ConnectorType.piHole,
  original: group(true),
  expected: group(false),
}

const adGuardScopeMutation: ConnectorScopeMutation = {
  backend: ConnectorType.adguardHome,
  original: {
    name: 'Kids',
    ids: ['192.0.2.10'],
    use_global_settings: true,
  },
  expected: {
    name: 'Kids',
    ids: ['192.0.2.10'],
    use_global_settings: false,
    filtering_enabled: false,
  },
}

const installStorageAndAlarmMock = (local: Record<string, unknown>) => {
  const createdAlarms: string[] = []
  const clearedAlarms: string[] = []
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: {
          get: (
            key: string,
            callback: (values: Record<string, unknown>) => void,
          ) => callback(key in local ? { [key]: local[key] } : {}),
          set: async (values: Record<string, unknown>) => {
            Object.assign(local, values)
          },
        },
      },
      alarms: {
        create: async (name: string) => {
          createdAlarms.push(name)
        },
        clear: async (name: string) => {
          clearedAlarms.push(name)
          return true
        },
      },
    },
  })
  return { createdAlarms, clearedAlarms }
}

test('global domain replacement restores only temporary AdGuard scope rules', async () => {
  const key = 'example-action'
  const local: Record<string, unknown> = {
    wormhole_scope_domain_actions_v1: {
      actions: {
        [key]: {
          domain: 'example.org',
          scopeName: 'Kids',
          expiresAt: Date.now() + 60_000,
          targets: [
            {
              connectorIdentity: getConnectorIdentity(piHole),
              mutation: piHoleDomainMutation,
            },
            {
              connectorIdentity: getConnectorIdentity(adGuard),
              mutation: adGuardDomainMutation,
            },
          ],
        },
      },
    },
  }
  const { clearedAlarms } = installStorageAndAlarmMock(local)
  const originalConfigured = ConnectorApiService.getConfiguredConnectors
  const originalRestore = ConnectorApiService.restoreDomainMutation
  const restored: string[] = []

  try {
    ConnectorApiService.getConfiguredConnectors = async () => [piHole, adGuard]
    ConnectorApiService.restoreDomainMutation = async (
      connector,
      mutation,
      onlyIfStillApplied,
    ) => {
      restored.push(
        `${getConnectorIdentity(connector)}:${mutation.backend}:${String(onlyIfStillApplied)}`,
      )
    }

    await ConnectorScopeDomainService.cancelTemporaryAllowsForDomain(
      'example.org',
    )

    assert.deepEqual(restored, [
      `${getConnectorIdentity(adGuard)}:${ConnectorType.adguardHome}:true`,
    ])
    assert.deepEqual(local.wormhole_scope_domain_actions_v1, { actions: {} })
    assert.deepEqual(clearedAlarms, [`wormhole.scopeDomain.v1.${key}`])
  } finally {
    ConnectorApiService.getConfiguredConnectors = originalConfigured
    ConnectorApiService.restoreDomainMutation = originalRestore
  }
})

test('temporary domain rollback includes the connector whose apply failed', async () => {
  const local: Record<string, unknown> = {}
  installStorageAndAlarmMock(local)
  const originalConfigured = ConnectorApiService.getConfiguredConnectors
  const originalPrepare = ConnectorApiService.prepareDomainMutation
  const originalApply = ConnectorApiService.applyDomainMutation
  const originalRestore = ConnectorApiService.restoreDomainMutation
  const targetCountsBeforeApply: number[] = []
  const restored: string[] = []

  try {
    ConnectorApiService.getConfiguredConnectors = async () => [piHole, adGuard]
    ConnectorApiService.prepareDomainMutation = async (connector) =>
      connector.connector_type === ConnectorType.adguardHome
        ? adGuardDomainMutation
        : piHoleDomainMutation
    ConnectorApiService.applyDomainMutation = async (connector) => {
      const storage = local.wormhole_scope_domain_actions_v1 as {
        actions: Record<string, { targets: unknown[] }>
      }
      targetCountsBeforeApply.push(
        Object.values(storage.actions)[0].targets.length,
      )
      if (connector.connector_type === ConnectorType.adguardHome) {
        throw new Error('write failed after mutation started')
      }
    }
    ConnectorApiService.restoreDomainMutation = async (
      connector,
      _mutation,
      onlyIfStillApplied,
    ) => {
      restored.push(
        `${getConnectorIdentity(connector)}:${String(onlyIfStillApplied)}`,
      )
    }

    await assert.rejects(
      ConnectorScopeDomainService.temporarilyAllowDomainForScope(
        'example.org',
        'Kids',
        60,
      ),
      /write failed/,
    )

    assert.deepEqual(targetCountsBeforeApply, [1, 2])
    assert.deepEqual(restored, [
      `${getConnectorIdentity(adGuard)}:false`,
      `${getConnectorIdentity(piHole)}:false`,
    ])
    assert.deepEqual(local.wormhole_scope_domain_actions_v1, { actions: {} })
  } finally {
    ConnectorApiService.getConfiguredConnectors = originalConfigured
    ConnectorApiService.prepareDomainMutation = originalPrepare
    ConnectorApiService.applyDomainMutation = originalApply
    ConnectorApiService.restoreDomainMutation = originalRestore
  }
})

test('scope pause rollback includes the connector whose apply failed', async () => {
  const local: Record<string, unknown> = {}
  installStorageAndAlarmMock(local)
  const originalConfigured = ConnectorApiService.getConfiguredConnectors
  const originalPrepare = ConnectorApiService.prepareScopeMutation
  const originalApply = ConnectorApiService.applyScopeMutation
  const originalRestore = ConnectorApiService.restoreScopeMutation
  const targetCountsBeforeApply: number[] = []
  const restored: string[] = []

  try {
    ConnectorApiService.getConfiguredConnectors = async () => [piHole, adGuard]
    ConnectorApiService.prepareScopeMutation = async (connector) =>
      connector.connector_type === ConnectorType.adguardHome
        ? adGuardScopeMutation
        : piHoleScopeMutation
    ConnectorApiService.applyScopeMutation = async (connector) => {
      const storage = local.wormhole_scope_pause_actions_v1 as {
        actions: Record<string, { targets: unknown[] }>
      }
      targetCountsBeforeApply.push(
        Object.values(storage.actions)[0].targets.length,
      )
      if (connector.connector_type === ConnectorType.adguardHome) {
        throw new Error('client update failed after mutation started')
      }
    }
    ConnectorApiService.restoreScopeMutation = async (
      connector,
      _mutation,
      onlyIfStillApplied,
    ) => {
      restored.push(
        `${getConnectorIdentity(connector)}:${String(onlyIfStillApplied)}`,
      )
    }

    await assert.rejects(
      ConnectorScopePauseService.pauseScope('Kids', 60),
      /client update failed/,
    )

    assert.deepEqual(targetCountsBeforeApply, [1, 2])
    assert.deepEqual(restored, [
      `${getConnectorIdentity(adGuard)}:false`,
      `${getConnectorIdentity(piHole)}:false`,
    ])
    assert.deepEqual(local.wormhole_scope_pause_actions_v1, { actions: {} })
  } finally {
    ConnectorApiService.getConfiguredConnectors = originalConfigured
    ConnectorApiService.prepareScopeMutation = originalPrepare
    ConnectorApiService.applyScopeMutation = originalApply
    ConnectorApiService.restoreScopeMutation = originalRestore
  }
})
