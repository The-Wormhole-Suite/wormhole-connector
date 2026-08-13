import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MultiInstanceOperationError,
  runMultiInstanceTransaction,
} from '../src/service/MultiInstanceOperation.ts'
import OperationCoordinator from '../src/service/OperationCoordinator.ts'

test('multi-instance preflight prevents every mutation when one server fails', async () => {
  const applied: string[] = []

  await assert.rejects(
    runMultiInstanceTransaction(
      [
        { address: 'one', value: 'one' },
        { address: 'two', value: 'two' },
      ],
      async (target) => {
        if (target === 'two') {
          throw new Error('offline')
        }
        return `snapshot-${target}`
      },
      async (target) => {
        applied.push(target)
      },
      async () => undefined,
    ),
    (reason: unknown) => {
      assert.ok(reason instanceof MultiInstanceOperationError)
      assert.deepEqual(reason.failures, [
        { address: 'two', phase: 'preflight', message: 'offline' },
      ])
      return true
    },
  )

  assert.deepEqual(applied, [])
})

test('multi-instance apply failure rolls back the failing and completed servers', async () => {
  const events: string[] = []

  await assert.rejects(
    runMultiInstanceTransaction(
      ['one', 'two', 'three'].map((value) => ({ address: value, value })),
      async (target) => `original-${target}`,
      async (target) => {
        events.push(`apply:${target}`)
        if (target === 'two') {
          throw new Error('write failed')
        }
        return target
      },
      async (target, snapshot) => {
        events.push(`rollback:${target}:${snapshot}`)
      },
    ),
    MultiInstanceOperationError,
  )

  assert.deepEqual(events, [
    'apply:one',
    'apply:two',
    'rollback:two:original-two',
    'rollback:one:original-one',
  ])
})

test('same-key operations are serialized and a failed operation releases the lock', async () => {
  let releaseFirst: () => void = () => undefined
  let markFirstStarted: () => void = () => undefined
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve
  })
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const events: string[] = []

  const first = OperationCoordinator.runExclusive(
    'domain:example.test',
    async () => {
      events.push('first:start')
      markFirstStarted()
      await firstGate
      events.push('first:end')
    },
  )
  await firstStarted

  const second = OperationCoordinator.runExclusive(
    'domain:example.test',
    async () => {
      events.push('second')
    },
  )
  await Promise.resolve()
  assert.deepEqual(events, ['first:start'])

  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first:start', 'first:end', 'second'])

  await assert.rejects(
    OperationCoordinator.runExclusive('domain:example.test', async () => {
      throw new Error('expected')
    }),
  )
  await OperationCoordinator.runExclusive('domain:example.test', async () => {
    events.push('after-error')
  })
  assert.equal(events.at(-1), 'after-error')
})

test('operation keys use browser-wide Web Locks when available', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  )
  const requestedNames: string[] = []

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: async (...args: unknown[]) => {
          const name = String(args[0])
          const callback = args.at(-1) as () => Promise<unknown>
          requestedNames.push(name)
          return callback()
        },
      },
    },
  })

  try {
    await OperationCoordinator.runExclusive(
      ['scope:Kids', 'domain:example.test'],
      async () => undefined,
    )
    assert.deepEqual(requestedNames, [
      'wormhole-connector:domain:example.test',
      'wormhole-connector:scope:Kids',
    ])
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    } else {
      Reflect.deleteProperty(globalThis, 'navigator')
    }
  }
})
