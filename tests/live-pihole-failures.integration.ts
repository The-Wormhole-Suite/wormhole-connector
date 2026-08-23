import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList'
import GroupDomainService from '../src/service/GroupDomainService'
import { MultiInstanceOperationError } from '../src/service/MultiInstanceOperation'
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
): Promise<void> => {
  await piHoleRaw(instance, `groups/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ comment: 'Wormhole Connector live failure test' }),
  })
}

const deletePiHoleGroup = async (
  instance: ConnectorSettingsStorage,
  name: string,
): Promise<void> => {
  await piHoleRaw(instance, `groups/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

const expectMultiInstanceFailure = async (
  operation: Promise<unknown>,
  address: string,
  phase: 'preflight' | 'apply' | 'rollback',
): Promise<void> => {
  await assert.rejects(operation, (reason: unknown) => {
    assert.ok(reason instanceof MultiInstanceOperationError)
    assert.ok(
      reason.failures.some(
        (failure) => failure.address === address && failure.phase === phase,
      ),
    )
    return true
  })
}

const deleteDomainBestEffort = async (
  instance: ConnectorSettingsStorage,
  domain: string,
): Promise<void> => {
  try {
    await PiHoleApiService.deleteExactDomain(
      instance,
      ApiList.whitelist,
      domain,
    )
  } catch {
    // The domain is expected to be absent in the tested failure paths.
  }
}

const installPiHoleWriteFailureInterceptor = (): {
  getRejectedWrites: () => number
  restore: () => void
} => {
  const originalFetch = globalThis.fetch
  const secondOrigin = new URL(piHoleSecond.pi_uri_base!).origin
  let rejectedWrites = 0

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    if (
      url.origin === secondOrigin &&
      url.pathname.startsWith('/api/domains/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ) {
      rejectedWrites += 1
      return new Response('Injected Pi-hole domain write failure', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return originalFetch(input, init)
  }

  return {
    getRejectedWrites: () => rejectedWrites,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

test('missing group on the second live Pi-hole prevents all writes', async () => {
  const suffix = Date.now()
  const groupName = `Wormhole Missing Group ${suffix}`
  const domain = `wormhole-missing-${suffix}.example`

  await createPiHoleGroup(piHole, groupName)
  await StorageService.saveConnectorSettingsArray([piHole, piHoleSecond])

  try {
    await expectMultiInstanceFailure(
      GroupDomainService.setDomainListForGroup(
        ApiList.whitelist,
        domain,
        groupName,
      ),
      piHoleSecond.pi_uri_base!,
      'preflight',
    )

    assert.equal(
      await PiHoleApiService.getExactDomain(piHole, ApiList.whitelist, domain),
      undefined,
    )
    assert.equal(
      await PiHoleApiService.getExactDomain(
        piHoleSecond,
        ApiList.whitelist,
        domain,
      ),
      undefined,
    )
  } finally {
    await StorageService.saveConnectorSettingsArray([])
    await Promise.allSettled([
      deleteDomainBestEffort(piHole, domain),
      deleteDomainBestEffort(piHoleSecond, domain),
      deletePiHoleGroup(piHole, groupName),
    ])
    await PiHoleApiService.endSessions([piHole, piHoleSecond])
  }
})

test('offline second Pi-hole fails in preflight without mutating the first', async () => {
  const suffix = Date.now()
  const groupName = `Wormhole Offline ${suffix}`
  const domain = `wormhole-offline-${suffix}.example`
  const offlineSecond: ConnectorSettingsStorage = {
    ...piHoleSecond,
    pi_uri_base: 'http://127.0.0.1:65534',
  }

  await createPiHoleGroup(piHole, groupName)
  await StorageService.saveConnectorSettingsArray([piHole, offlineSecond])

  try {
    await expectMultiInstanceFailure(
      GroupDomainService.setDomainListForGroup(
        ApiList.whitelist,
        domain,
        groupName,
      ),
      offlineSecond.pi_uri_base!,
      'preflight',
    )

    assert.equal(
      await PiHoleApiService.getExactDomain(piHole, ApiList.whitelist, domain),
      undefined,
    )
  } finally {
    await StorageService.saveConnectorSettingsArray([])
    await Promise.allSettled([
      deleteDomainBestEffort(piHole, domain),
      deletePiHoleGroup(piHole, groupName),
    ])
    await PiHoleApiService.endSessions([piHole, offlineSecond])
  }
})

test('partial write failure on the second Pi-hole rolls the first back', async () => {
  const suffix = Date.now()
  const groupName = `Wormhole Rollback ${suffix}`
  const domain = `wormhole-rollback-${suffix}.example`

  await createPiHoleGroup(piHole, groupName)
  await createPiHoleGroup(piHoleSecond, groupName)
  const interceptor = installPiHoleWriteFailureInterceptor()
  await StorageService.saveConnectorSettingsArray([piHole, piHoleSecond])

  try {
    await expectMultiInstanceFailure(
      GroupDomainService.setDomainListForGroup(
        ApiList.whitelist,
        domain,
        groupName,
      ),
      piHoleSecond.pi_uri_base!,
      'apply',
    )

    assert.ok(interceptor.getRejectedWrites() >= 1)
    assert.equal(
      await PiHoleApiService.getExactDomain(piHole, ApiList.whitelist, domain),
      undefined,
    )
    assert.equal(
      await PiHoleApiService.getExactDomain(
        piHoleSecond,
        ApiList.whitelist,
        domain,
      ),
      undefined,
    )
  } finally {
    interceptor.restore()
    await StorageService.saveConnectorSettingsArray([])
    await Promise.allSettled([
      deleteDomainBestEffort(piHole, domain),
      deleteDomainBestEffort(piHoleSecond, domain),
      deletePiHoleGroup(piHole, groupName),
      deletePiHoleGroup(piHoleSecond, groupName),
    ])
    await PiHoleApiService.endSessions([piHole, piHoleSecond])
  }
})
