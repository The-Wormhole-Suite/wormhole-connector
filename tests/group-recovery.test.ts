import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList.ts'
import type { PiHoleDomain } from '../src/api/models/PiHoleDomains.ts'
import type { PiHoleGroup } from '../src/api/models/PiHoleGroups.ts'
import GroupDomainService from '../src/service/GroupDomainService.ts'
import GroupPauseService from '../src/service/GroupPauseService.ts'
import { MultiInstanceOperationError } from '../src/service/MultiInstanceOperation.ts'
import PiHoleApiService from '../src/service/PiHoleApiService.ts'

const domain = (overrides: Partial<PiHoleDomain> = {}): PiHoleDomain => ({
  domain: 'legacy-pattern',
  unicode: 'legacy-pattern',
  type: 'allow',
  kind: 'regex',
  comment: 'Client-group pause by PiHole Browser Extension',
  groups: [0],
  enabled: true,
  id: 1,
  date_added: 0,
  date_modified: 0,
  ...overrides,
})

const group = (id: number): PiHoleGroup => ({
  name: 'Family',
  comment: null,
  enabled: true,
  id,
  date_added: 0,
  date_modified: 0,
})

const installStorageAndAlarmMock = (
  local: Record<string, unknown>,
  createdAlarms: string[],
) => {
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
          remove: async (key: string) => {
            delete local[key]
          },
        },
      },
      alarms: {
        create: async (name: string) => {
          createdAlarms.push(name)
        },
        clear: async () => true,
      },
    },
  })
}

test('failed legacy cleanup retains recovery data and schedules another attempt', async () => {
  const local: Record<string, unknown> = {
    group_pause_actions_v1: {
      actions: {
        old: {
          pattern: 'legacy-pattern',
          targets: [{ pi_uri_base: 'https://one.example.test/admin' }],
        },
      },
    },
  }
  const alarms: string[] = []
  installStorageAndAlarmMock(local, alarms)

  const originals = {
    getConfiguredPiHoles: PiHoleApiService.getConfiguredPiHoles,
    getRegexDomain: PiHoleApiService.getRegexDomain,
    deleteRegexDomain: PiHoleApiService.deleteRegexDomain,
  }
  const originalWarn = console.warn
  console.warn = () => undefined

  try {
    PiHoleApiService.getConfiguredPiHoles = async () => [
      { pi_uri_base: 'https://one.example.test/admin', api_key: '' },
    ]
    PiHoleApiService.getRegexDomain = async () => domain()
    PiHoleApiService.deleteRegexDomain = async () => {
      throw new Error('temporarily offline')
    }

    await GroupPauseService.initialize()

    assert.deepEqual(local.group_pause_actions_v1, {
      actions: {
        old: {
          pattern: 'legacy-pattern',
          targets: [{ pi_uri_base: 'https://one.example.test/admin' }],
        },
      },
    })
    assert.equal(alarms.length, 1)
    assert.match(alarms[0], /^pihole\.groupPause\.old$/)
  } finally {
    PiHoleApiService.getConfiguredPiHoles = originals.getConfiguredPiHoles
    PiHoleApiService.getRegexDomain = originals.getRegexDomain
    PiHoleApiService.deleteRegexDomain = originals.deleteRegexDomain
    console.warn = originalWarn
  }
})

test('missing group on one Pi-hole blocks all group-domain mutations', async () => {
  const first = { pi_uri_base: 'https://one.example.test/admin', api_key: '' }
  const second = { pi_uri_base: 'https://two.example.test/admin', api_key: '' }
  let mutations = 0

  const originals = {
    getConfiguredPiHoles: PiHoleApiService.getConfiguredPiHoles,
    getGroup: PiHoleApiService.getGroup,
    getExactDomain: PiHoleApiService.getExactDomain,
    addExactDomain: PiHoleApiService.addExactDomain,
    replaceExactDomain: PiHoleApiService.replaceExactDomain,
    deleteExactDomain: PiHoleApiService.deleteExactDomain,
  }

  try {
    PiHoleApiService.getConfiguredPiHoles = async () => [first, second]
    PiHoleApiService.getGroup = async (piHole) =>
      piHole.pi_uri_base === first.pi_uri_base ? group(7) : null
    PiHoleApiService.getExactDomain = async () => null
    PiHoleApiService.addExactDomain = (async () => {
      mutations += 1
      return domain({ domain: 'example.test', kind: 'exact' })
    }) as typeof PiHoleApiService.addExactDomain
    PiHoleApiService.replaceExactDomain = (async () => {
      mutations += 1
      return domain({ domain: 'example.test', kind: 'exact' })
    }) as typeof PiHoleApiService.replaceExactDomain
    PiHoleApiService.deleteExactDomain = (async () => {
      mutations += 1
      throw new Error('must not run')
    }) as typeof PiHoleApiService.deleteExactDomain

    await assert.rejects(
      GroupDomainService.setDomainListForGroup(
        ApiList.whitelist,
        'example.test',
        'Family',
      ),
      MultiInstanceOperationError,
    )
    assert.equal(mutations, 0)
  } finally {
    PiHoleApiService.getConfiguredPiHoles = originals.getConfiguredPiHoles
    PiHoleApiService.getGroup = originals.getGroup
    PiHoleApiService.getExactDomain = originals.getExactDomain
    PiHoleApiService.addExactDomain = originals.addExactDomain
    PiHoleApiService.replaceExactDomain = originals.replaceExactDomain
    PiHoleApiService.deleteExactDomain = originals.deleteExactDomain
  }
})
