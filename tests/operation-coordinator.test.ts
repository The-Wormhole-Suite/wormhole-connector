import assert from 'node:assert/strict'
import test from 'node:test'
import OperationCoordinator from '../src/service/OperationCoordinator.ts'

test('an exclusive lock serializes a key while unrelated keys proceed', async () => {
  const events: string[] = []
  let releaseFirst: () => void = () => {}
  let markStarted: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = OperationCoordinator.runExclusive('domain:a', async () => {
    events.push('first-start')
    markStarted()
    await gate
    events.push('first-end')
  })
  await started

  const second = OperationCoordinator.runExclusive('domain:a', async () => {
    events.push('second-start')
  })
  await OperationCoordinator.runExclusive('domain:b', async () => {
    events.push('unrelated')
  })

  assert.deepEqual(events, ['first-start', 'unrelated'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(events, [
    'first-start',
    'unrelated',
    'first-end',
    'second-start',
  ])
})

test('a failed exclusive operation releases its key for subsequent requests', async () => {
  await assert.rejects(
    OperationCoordinator.runExclusive('domain:failure', async () => {
      throw new Error('simulated failure')
    }),
    /simulated failure/,
  )
  let completed = false
  await OperationCoordinator.runExclusive('domain:failure', async () => {
    completed = true
  })
  assert.equal(completed, true)
})
