import assert from 'node:assert/strict'
import test from 'node:test'
import { ConnectorType, StorageService } from '../src/service/StorageService.ts'

const createArea = (values: Record<string, unknown>) => ({
  get: (
    keys: string | string[] | Record<string, unknown> | null,
    callback: (items: Record<string, unknown>) => void,
  ) => {
    if (keys === null) {
      callback({ ...values })
      return
    }
    const names =
      typeof keys === 'string'
        ? [keys]
        : Array.isArray(keys)
          ? keys
          : Object.keys(keys)
    callback(
      Object.fromEntries(
        names.flatMap((key) => (key in values ? [[key, values[key]]] : [])),
      ),
    )
  },
  set: async (items: Record<string, unknown>) => {
    Object.assign(values, items)
  },
  remove: async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete values[key]
    }
  },
  clear: async () => {
    for (const key of Object.keys(values)) {
      delete values[key]
    }
  },
})

test('connection storage preserves password whitespace and keeps SIDs out of local storage', async () => {
  const local: Record<string, unknown> = {}
  const session: Record<string, unknown> = {
    'session_storage_https://dns.example.test/reverse/api/': {
      value: 'old-session',
    },
  }

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: createArea(local),
        session: createArea(session),
      },
    },
  })

  await StorageService.savePiHoleSettingsArray([
    {
      pi_uri_base: ' https://dns.example.test/reverse/admin/ ',
      api_key: ' pass phrase with spaces ',
    },
  ])

  assert.deepEqual(local.pi_hole_settings, [
    {
      connector_type: ConnectorType.piHole,
      pi_uri_base: 'https://dns.example.test/reverse/admin',
      api_key: ' pass phrase with spaces ',
    },
  ])
  assert.deepEqual(Object.keys(local), ['pi_hole_settings'])
  assert.deepEqual(session, {})
})

test('connection storage retains AdGuard Home type and credential whitespace', async () => {
  const local: Record<string, unknown> = {}
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: createArea(local),
        session: createArea({}),
      },
    },
  })

  await StorageService.saveConnectorSettingsArray([
    {
      connector_type: ConnectorType.adguardHome,
      pi_uri_base: ' https://dns.example.test/adguard/ ',
      username: ' admin user ',
      api_key: ' pass phrase ',
    },
  ])

  assert.deepEqual(local.pi_hole_settings, [
    {
      connector_type: ConnectorType.adguardHome,
      pi_uri_base: 'https://dns.example.test/adguard',
      username: ' admin user ',
      api_key: ' pass phrase ',
    },
  ])
})
