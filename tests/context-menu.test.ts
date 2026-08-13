import assert from 'node:assert/strict'
import test from 'node:test'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

test('context menu toggles keep one click listener and ignore stale removals', async () => {
  const storageListeners: StorageListener[] = []
  const clickListeners: Array<() => void> = []
  const pendingRemovals: Array<() => void> = []
  const createdMenus: chrome.contextMenus.CreateProperties[] = []

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: {
          get: (
            key: string,
            callback: (values: Record<string, unknown>) => void,
          ) => callback({ [key]: true }),
        },
        onChanged: {
          addListener: (listener: StorageListener) => {
            storageListeners.push(listener)
          },
        },
      },
      contextMenus: {
        create: (properties: chrome.contextMenus.CreateProperties) => {
          createdMenus.push(properties)
        },
        removeAll: (callback: () => void) => {
          pendingRemovals.push(callback)
        },
        onClicked: {
          addListener: (listener: () => void) => {
            clickListeners.push(listener)
          },
        },
      },
      i18n: {
        getMessage: (key: string) => key,
      },
      runtime: {
        lastError: undefined,
      },
      action: {},
    },
  })

  const { default: ContextMenuInitializer } =
    await import('../src/module/background/init/ContextMenuInitializer.ts')
  new ContextMenuInitializer().init()
  await Promise.resolve()
  assert.equal(pendingRemovals.length, 1)
  pendingRemovals.shift()!()
  await Promise.resolve()
  assert.equal(createdMenus.length, 0)

  storageListeners[0](
    { disable_context_menu: { oldValue: true, newValue: false } },
    'local',
  )
  storageListeners[0](
    { disable_context_menu: { oldValue: false, newValue: true } },
    'local',
  )
  assert.equal(pendingRemovals.length, 2)

  // Completing the older enable request after a newer disable request must
  // not recreate a stale menu.
  pendingRemovals.shift()!()
  pendingRemovals.shift()!()
  await Promise.resolve()
  assert.equal(createdMenus.length, 0)

  storageListeners[0](
    { disable_context_menu: { oldValue: true, newValue: false } },
    'local',
  )
  pendingRemovals.shift()!()
  await Promise.resolve()
  assert.equal(createdMenus.length, 6)
  assert.equal(clickListeners.length, 1)
})
