import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList'
import AdGuardHomeApiService from '../src/service/AdGuardHomeApiService'
import GroupDomainService from '../src/service/GroupDomainService'
import { getPiHoleApiBase } from '../src/service/PiHoleUrl'
import PiHoleApiService from '../src/service/PiHoleApiService'
import {
  ConnectorType,
  StorageService,
  type ConnectorSettingsStorage,
} from '../src/service/StorageService'

const localValues: Record<string, unknown> = {}

const getLocalValues = (
  keys: string | string[] | Record<string, unknown> | null,
): Record<string, unknown> => {
  if (keys === null) {
    return { ...localValues }
  }
  if (typeof keys === 'string') {
    return keys in localValues ? { [keys]: localValues[keys] } : {}
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(
      keys
        .filter((key) => key in localValues)
        .map((key) => [key, localValues[key]]),
    )
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      key in localValues ? localValues[key] : fallback,
    ]),
  )
}

const localStorageArea = {
  get(
    keys: string | string[] | Record<string, unknown> | null,
    callback: (items: Record<string, unknown>) => void,
  ) {
    callback(getLocalValues(keys))
  },
  async set(items: Record<string, unknown>) {
    Object.assign(localValues, items)
  },
  async remove(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localValues[key]
    }
  },
} as unknown as chrome.storage.StorageArea

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    storage: { local: localStorageArea },
    alarms: {
      async create() {},
      async clear() {
        return true
      },
    },
  },
})

const requiredEnv = (name: string): string => {
  const value = process.env[name]
  if (typeof value === 'undefined') {
    throw new Error(`${name} is required for live backend integration tests`)
  }
  return value
}

const piHole: ConnectorSettingsStorage = {
  connector_type: ConnectorType.piHole,
  pi_uri_base: requiredEnv('PIHOLE_URL'),
  api_key: requiredEnv('PIHOLE_PASSWORD'),
}

const piHoleSecond: ConnectorSettingsStorage = {
  connector_type: ConnectorType.piHole,
  pi_uri_base: requiredEnv('PIHOLE_SECOND_URL'),
  api_key: requiredEnv('PIHOLE_SECOND_PASSWORD'),
}

const adGuard: ConnectorSettingsStorage = {
  connector_type: ConnectorType.adguardHome,
  pi_uri_base: requiredEnv('ADGUARD_URL'),
  username: requiredEnv('ADGUARD_USERNAME'),
  api_key: requiredEnv('ADGUARD_PASSWORD'),
}

const piHoleRaw = async (
  instance: ConnectorSettingsStorage,
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  await PiHoleApiService.getGroups(instance)
  const sid = await StorageService.getSid(instance.pi_uri_base!)
  assert.ok(sid)

  const response = await fetch(
    new URL(path, getPiHoleApiBase(instance.pi_uri_base!)),
    {
      ...init,
      headers: {
        'X-FTL-SID': sid,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    },
  )
  if (!response.ok) {
    throw new Error(
      `Pi-hole fixture request ${path} failed with ${response.status}: ${await response.text()}`,
    )
  }
  return response
}

const createPiHoleGroup = async (
  instance: ConnectorSettingsStorage,
  name: string,
): Promise<{ id: number; name: string }> => {
  const response = await piHoleRaw(
    instance,
    `groups/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ comment: 'Wormhole Connector live test' }),
    },
  )
  const data = (await response.json()) as {
    groups: Array<{ id: number; name: string }>
  }
  const group = data.groups.find((item) => item.name === name)
  assert.ok(group)
  return group
}

const deletePiHoleGroup = async (
  instance: ConnectorSettingsStorage,
  name: string,
): Promise<void> => {
  await piHoleRaw(instance, `groups/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

const adGuardApiUrl = (path: string): string => {
  const base = new URL(adGuard.pi_uri_base!)
  const segments = base.pathname.split('/').filter(Boolean)
  if (segments.at(-1)?.toLowerCase() === 'control') {
    segments.pop()
  }
  segments.push('control', ...path.split('/').filter(Boolean))
  base.pathname = `/${segments.join('/')}`
  return base.toString()
}

const adGuardRaw = async (
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const authorization = Buffer.from(
    `${adGuard.username}:${adGuard.api_key}`,
  ).toString('base64')
  const response = await fetch(adGuardApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Basic ${authorization}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    throw new Error(
      `AdGuard Home fixture request ${path} failed with ${response.status}: ${await response.text()}`,
    )
  }
  return response
}

const setAdGuardRules = async (rules: readonly string[]): Promise<void> => {
  await adGuardRaw('filtering/set_rules', {
    method: 'POST',
    body: JSON.stringify({ rules: [...rules] }),
  })
}

const addAdGuardClient = async (name: string): Promise<void> => {
  await adGuardRaw('clients/add', {
    method: 'POST',
    body: JSON.stringify({
      name,
      ids: ['10.10.10.10'],
      use_global_settings: true,
      filtering_enabled: true,
    }),
  })
}

const deleteAdGuardClient = async (name: string): Promise<void> => {
  await adGuardRaw('clients/delete', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

test('Pi-hole v6 API works through Wormhole Connector services', async () => {
  const domain = `wormhole-live-${Date.now()}.example`
  let originalBlocking = true

  try {
    const version = await PiHoleApiService.getPiHoleVersion(piHole)
    assert.equal(version.status, 200)
    assert.ok(version.data.version.ftl.local.version)

    const initialStatus = await PiHoleApiService.getPiHoleStatusFor(piHole)
    assert.ok(['enabled', 'disabled'].includes(initialStatus.blocking))
    originalBlocking = initialStatus.blocking === 'enabled'

    await PiHoleApiService.setPiHoleStatusFor(piHole, false, null)
    assert.equal(
      (await PiHoleApiService.getPiHoleStatusFor(piHole)).blocking,
      'disabled',
    )

    await PiHoleApiService.setPiHoleStatusFor(piHole, true, null)
    assert.equal(
      (await PiHoleApiService.getPiHoleStatusFor(piHole)).blocking,
      'enabled',
    )

    const groups = await PiHoleApiService.getGroups(piHole)
    assert.ok(groups.length > 0)
    assert.ok(groups.some((group) => group.name === 'Default'))

    await PiHoleApiService.addExactDomain(piHole, ApiList.whitelist, domain, {
      comment: 'Wormhole Connector live integration test',
      groups: groups.map((group) => group.id),
      enabled: true,
    })

    const added = await PiHoleApiService.getExactDomain(
      piHole,
      ApiList.whitelist,
      domain,
    )
    assert.equal(added?.domain, domain)
    assert.equal(added?.enabled, true)

    await PiHoleApiService.deleteExactDomain(piHole, ApiList.whitelist, domain)
    assert.equal(
      await PiHoleApiService.getExactDomain(piHole, ApiList.whitelist, domain),
      undefined,
    )
  } finally {
    try {
      await PiHoleApiService.deleteExactDomain(
        piHole,
        ApiList.whitelist,
        domain,
      )
    } catch {
      // Best-effort cleanup if the mutation never happened or was already removed.
    }
    try {
      await PiHoleApiService.setPiHoleStatusFor(piHole, originalBlocking, null)
    } finally {
      await PiHoleApiService.endSession(piHole)
    }
  }
})

test('Pi-hole group names resolve independently across live instances', async () => {
  const suffix = Date.now()
  const groupName = `Wormhole Live Shared ${suffix}`
  const fillerName = `Wormhole Live Filler ${suffix}`
  const domain = `wormhole-multi-${suffix}.example`

  const firstGroup = await createPiHoleGroup(piHole, groupName)
  await createPiHoleGroup(piHoleSecond, fillerName)
  const secondGroup = await createPiHoleGroup(piHoleSecond, groupName)
  assert.notEqual(firstGroup.id, secondGroup.id)

  await StorageService.saveConnectorSettingsArray([piHole, piHoleSecond])

  try {
    const commonGroups = await PiHoleApiService.getCommonGroups()
    assert.ok(commonGroups.some((group) => group.name === groupName))

    await GroupDomainService.setDomainListForGroup(
      ApiList.whitelist,
      domain,
      groupName,
    )

    const [firstDomain, secondDomain] = await Promise.all([
      PiHoleApiService.getExactDomain(piHole, ApiList.whitelist, domain),
      PiHoleApiService.getExactDomain(piHoleSecond, ApiList.whitelist, domain),
    ])
    assert.deepEqual(firstDomain?.groups, [firstGroup.id])
    assert.deepEqual(secondDomain?.groups, [secondGroup.id])
  } finally {
    await Promise.allSettled([
      PiHoleApiService.deleteExactDomain(piHole, ApiList.whitelist, domain),
      PiHoleApiService.deleteExactDomain(
        piHoleSecond,
        ApiList.whitelist,
        domain,
      ),
    ])
    await Promise.allSettled([
      deletePiHoleGroup(piHole, groupName),
      deletePiHoleGroup(piHoleSecond, groupName),
      deletePiHoleGroup(piHoleSecond, fillerName),
    ])
    await StorageService.saveConnectorSettingsArray([])
    await PiHoleApiService.endSessions([piHole, piHoleSecond])
  }
})

test('AdGuard Home global and client-specific operations work through Wormhole Connector services', async () => {
  const domain = `wormhole-live-${Date.now()}.example`
  const clientName = `wormhole-live-client-${Date.now()}`
  const originalRules = await AdGuardHomeApiService.getUserRules(adGuard)
  const initialStatus = await AdGuardHomeApiService.getStatusFor(adGuard)

  assert.equal(initialStatus.running, true)
  assert.ok(initialStatus.version)

  try {
    await AdGuardHomeApiService.setProtectionFor(adGuard, false, null)
    assert.equal(
      (await AdGuardHomeApiService.getStatusFor(adGuard)).protection_enabled,
      false,
    )
    await AdGuardHomeApiService.setProtectionFor(adGuard, true, null)
    assert.equal(
      (await AdGuardHomeApiService.getStatusFor(adGuard)).protection_enabled,
      true,
    )

    const globalMutation = await AdGuardHomeApiService.prepareRuleMutation(
      adGuard,
      ApiList.blacklist,
      domain,
    )
    await AdGuardHomeApiService.applyRuleMutation(adGuard, globalMutation)
    assert.deepEqual(
      await AdGuardHomeApiService.getUserRules(adGuard),
      globalMutation.expectedRules,
    )
    await AdGuardHomeApiService.restoreRuleMutation(adGuard, globalMutation)

    await addAdGuardClient(clientName)
    const client = await AdGuardHomeApiService.getClient(adGuard, clientName)
    assert.ok(client)

    const disableClient = AdGuardHomeApiService.prepareClientMutation(
      client,
      false,
    )
    await AdGuardHomeApiService.applyClientMutation(adGuard, disableClient)
    const disabledClient = await AdGuardHomeApiService.getClient(
      adGuard,
      clientName,
    )
    assert.equal(disabledClient?.use_global_settings, false)
    assert.equal(disabledClient?.filtering_enabled, false)
    await AdGuardHomeApiService.restoreClientMutation(adGuard, disableClient)

    const clientRuleMutation = await AdGuardHomeApiService.prepareRuleMutation(
      adGuard,
      ApiList.whitelist,
      domain,
      clientName,
    )
    await AdGuardHomeApiService.applyRuleMutation(adGuard, clientRuleMutation)
    assert.ok(
      (await AdGuardHomeApiService.getUserRules(adGuard)).includes(
        clientRuleMutation.allowRule,
      ),
    )
    await AdGuardHomeApiService.restoreRuleMutation(adGuard, clientRuleMutation)
  } finally {
    await setAdGuardRules(originalRules)
    try {
      await deleteAdGuardClient(clientName)
    } catch {
      // Best-effort cleanup when client creation failed before completion.
    }
    await AdGuardHomeApiService.setProtectionFor(
      adGuard,
      initialStatus.protection_enabled,
      null,
    )
  }
})

test('AdGuard Home concurrent foreign rule changes are never overwritten', async () => {
  const domain = `wormhole-concurrency-${Date.now()}.example`
  const foreignRule = `||foreign-${Date.now()}.example^`
  const originalRules = await AdGuardHomeApiService.getUserRules(adGuard)
  const mutation = await AdGuardHomeApiService.prepareRuleMutation(
    adGuard,
    ApiList.blacklist,
    domain,
  )

  try {
    await setAdGuardRules([...originalRules, foreignRule])

    await assert.rejects(
      AdGuardHomeApiService.applyRuleMutation(adGuard, mutation),
      /changed concurrently/,
    )

    const after = await AdGuardHomeApiService.getUserRules(adGuard)
    assert.ok(after.includes(foreignRule))
    assert.ok(!after.includes(mutation.blockRule))
  } finally {
    await setAdGuardRules(originalRules)
  }
})
