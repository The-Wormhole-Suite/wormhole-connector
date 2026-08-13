import assert from 'node:assert/strict'
import test from 'node:test'
import ChromeRuntimeInitializer from '../src/module/background/init/ChromeRuntimeInitializer.ts'

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
})

test('version migration removes sessions without deleting settings or credentials', async () => {
  const settings = [
    { pi_uri_base: 'https://dns.example.test/admin', api_key: 'password' },
  ]
  const local: Record<string, unknown> = {
    pi_hole_settings: settings,
    default_disable_time: 10,
    group_pause_times: [60, 300, 900],
    temporary_allow_times: [60, 300, 900],
    reload_after_disable: true,
    reload_after_white_list: true,
    session_storage_legacy: { value: 'legacy-sid' },
  }
  const session: Record<string, unknown> = {
    session_storage_current: { value: 'current-sid' },
  }

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: createArea(local),
        session: createArea(session),
      },
      runtime: {
        getManifest: () => ({ version: '4.11.0' }),
      },
    },
  })

  const initializer = new ChromeRuntimeInitializer()
  await (
    initializer as unknown as {
      handleInstalled: (
        details: chrome.runtime.InstalledDetails,
      ) => Promise<void>
    }
  ).handleInstalled({
    reason: 'update',
    previousVersion: '4.10.0',
  } as chrome.runtime.InstalledDetails)

  assert.deepEqual(local.pi_hole_settings, settings)
  assert.equal(local.session_storage_legacy, undefined)
  assert.deepEqual(session, {})
})
