import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList.ts'
import type { PiHoleDomain } from '../src/api/models/PiHoleDomains.ts'
import PiHoleApiService from '../src/service/PiHoleApiService.ts'
import TemporaryActionService from '../src/service/TemporaryActionService.ts'

const piHole = {
  pi_uri_base: 'https://dns.example.test/admin',
  api_key: 'password',
}

const domain = (): PiHoleDomain => ({
  domain: 'example.org',
  unicode: 'example.org',
  type: ApiList.whitelist,
  kind: 'exact',
  comment: 'Temporary allow by Wormhole Connector',
  groups: [0],
  enabled: true,
  id: 1,
  date_added: 0,
  date_modified: 0,
})

const installStorageAndAlarmMock = (local: Record<string, unknown>) => {
  const created: Array<{ name: string; when: number | undefined }> = []
  const cleared: string[] = []

  Reflect.deleteProperty(globalThis, 'browser')
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
        create: async (name: string, info: { when?: number }) => {
          created.push({ name, when: info.when })
        },
        clear: async (name: string) => {
          cleared.push(name)
          return true
        },
      },
    },
  })

  return { created, cleared }
}

test('restart reschedules active domain and group timers together', async () => {
  const domainKey = encodeURIComponent('example.org')
  const groupKey = encodeURIComponent('Family')
  const domainExpiry = Date.now() + 60_000
  const groupExpiry = Date.now() + 120_000
  const local: Record<string, unknown> = {
    temporary_actions_v1: {
      domains: {
        [domainKey]: {
          domain: 'example.org',
          expiresAt: domainExpiry,
          targets: [],
        },
      },
      groups: {
        [groupKey]: {
          groupName: 'Family',
          expiresAt: groupExpiry,
          targets: [],
        },
      },
    },
  }
  const { created, cleared } = installStorageAndAlarmMock(local)

  await TemporaryActionService.initialize()

  assert.deepEqual(created, [
    {
      name: `pihole.temporaryAllow.${domainKey}`,
      when: domainExpiry,
    },
    {
      name: `pihole.temporaryGroup.${groupKey}`,
      when: groupExpiry,
    },
  ])
  assert.deepEqual(cleared, [])
})

test('restart restores an already expired temporary domain action', async () => {
  const domainKey = encodeURIComponent('example.org')
  const expected = domain()
  const local: Record<string, unknown> = {
    temporary_actions_v1: {
      domains: {
        [domainKey]: {
          domain: 'example.org',
          expiresAt: Date.now() - 1000,
          targets: [
            {
              pi_uri_base: piHole.pi_uri_base,
              original: null,
              expected,
            },
          ],
        },
      },
      groups: {},
    },
  }
  const { created, cleared } = installStorageAndAlarmMock(local)
  const originals = {
    getConfiguredPiHoles: PiHoleApiService.getConfiguredPiHoles,
    getExactDomain: PiHoleApiService.getExactDomain,
    deleteExactDomain: PiHoleApiService.deleteExactDomain,
  }
  const deleted: string[] = []

  try {
    PiHoleApiService.getConfiguredPiHoles = async () => [piHole]
    PiHoleApiService.getExactDomain = async () => expected
    PiHoleApiService.deleteExactDomain = async (_instance, _list, value) => {
      deleted.push(value)
    }

    await TemporaryActionService.initialize()

    assert.deepEqual(deleted, ['example.org'])
    assert.deepEqual(local.temporary_actions_v1, {
      domains: {},
      groups: {},
    })
    assert.deepEqual(created, [])
    assert.deepEqual(cleared, [`pihole.temporaryAllow.${domainKey}`])
  } finally {
    PiHoleApiService.getConfiguredPiHoles = originals.getConfiguredPiHoles
    PiHoleApiService.getExactDomain = originals.getExactDomain
    PiHoleApiService.deleteExactDomain = originals.deleteExactDomain
  }
})
