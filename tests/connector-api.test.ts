import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList.ts'
import PiHoleApiStatusEnum from '../src/api/enum/PiHoleApiStatusEnum.ts'
import AdGuardHomeApiService from '../src/service/AdGuardHomeApiService.ts'
import ConnectorApiService from '../src/service/ConnectorApiService.ts'
import { MultiInstanceOperationError } from '../src/service/MultiInstanceOperation.ts'
import PiHoleApiService from '../src/service/PiHoleApiService.ts'
import {
  ConnectorType,
  StorageService,
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

test('mixed Pi-hole and AdGuard Home protection states are explicit', async () => {
  const originalSettings = StorageService.getConnectorSettingsArray
  const originalPiStatus = PiHoleApiService.getPiHoleStatusFor
  const originalAdGuardStatus = AdGuardHomeApiService.getStatusFor
  StorageService.getConnectorSettingsArray = async () => [piHole, adGuard]
  PiHoleApiService.getPiHoleStatusFor = async () => ({
    blocking: PiHoleApiStatusEnum.enabled,
    timer: null,
    took: 0,
  })
  AdGuardHomeApiService.getStatusFor = async () => ({
    protection_enabled: false,
    protection_disabled_duration: 0,
    running: true,
    version: 'v0.107.65',
  })

  try {
    assert.equal(
      await ConnectorApiService.getProtectionStatusCombined(),
      PiHoleApiStatusEnum.mixed,
    )
  } finally {
    StorageService.getConnectorSettingsArray = originalSettings
    PiHoleApiService.getPiHoleStatusFor = originalPiStatus
    AdGuardHomeApiService.getStatusFor = originalAdGuardStatus
  }
})

test('common scopes intersect Pi-hole groups and AdGuard persistent clients', async () => {
  const originalSettings = StorageService.getConnectorSettingsArray
  const originalGroups = PiHoleApiService.getGroups
  const originalClients = AdGuardHomeApiService.getClients
  StorageService.getConnectorSettingsArray = async () => [piHole, adGuard]
  PiHoleApiService.getGroups = async () => [
    { id: 0, name: 'Default', comment: null, enabled: true },
    { id: 7, name: 'Kids', comment: null, enabled: true },
  ]
  AdGuardHomeApiService.getClients = async () => [
    { name: 'Kids', ids: ['192.0.2.7'] },
    { name: 'TV', ids: ['192.0.2.8'] },
  ]

  try {
    assert.deepEqual(await ConnectorApiService.getCommonScopes(), [
      { name: 'Kids' },
    ])
  } finally {
    StorageService.getConnectorSettingsArray = originalSettings
    PiHoleApiService.getGroups = originalGroups
    AdGuardHomeApiService.getClients = originalClients
  }
})

test('a missing AdGuard scope prevents every cross-backend domain write', async () => {
  const originalSettings = StorageService.getConnectorSettingsArray
  const originalGroups = PiHoleApiService.getGroups
  const originalExact = PiHoleApiService.getExactDomain
  const originalAdd = PiHoleApiService.addExactDomain
  const originalClient = AdGuardHomeApiService.getClient
  StorageService.getConnectorSettingsArray = async () => [piHole, adGuard]
  PiHoleApiService.getGroups = async () => [
    { id: 7, name: 'Kids', comment: null, enabled: true },
  ]
  PiHoleApiService.getExactDomain = async () => undefined
  let piHoleWrites = 0
  PiHoleApiService.addExactDomain = (async () => {
    piHoleWrites += 1
    throw new Error('unexpected write')
  }) as typeof PiHoleApiService.addExactDomain
  AdGuardHomeApiService.getClient = async () => undefined

  try {
    await assert.rejects(
      ConnectorApiService.setDomainListForScope(
        ApiList.whitelist,
        'example.org',
        'Kids',
      ),
      (reason) => reason instanceof MultiInstanceOperationError,
    )
    assert.equal(piHoleWrites, 0)
  } finally {
    StorageService.getConnectorSettingsArray = originalSettings
    PiHoleApiService.getGroups = originalGroups
    PiHoleApiService.getExactDomain = originalExact
    PiHoleApiService.addExactDomain = originalAdd
    AdGuardHomeApiService.getClient = originalClient
  }
})
