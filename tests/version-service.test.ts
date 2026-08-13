import assert from 'node:assert/strict'
import test from 'node:test'
import type { PiHoleVersionsV6 } from '../src/api/models/PiHoleVersions.ts'
import {
  compareVersions,
  hasPiHoleUpdate,
} from '../src/service/VersionService.ts'

const versions = (
  local: [string, string, string],
  remote: [string, string, string],
): PiHoleVersionsV6 => ({
  version: {
    core: {
      local: { branch: 'master', version: local[0], hash: 'local' },
      remote: { version: remote[0], hash: 'remote' },
    },
    web: {
      local: { branch: 'master', version: local[1], hash: 'local' },
      remote: { version: remote[1], hash: 'remote' },
    },
    ftl: {
      local: {
        branch: 'master',
        version: local[2],
        hash: 'local',
        date: '2026-01-01',
      },
      remote: { version: remote[2], hash: 'remote' },
    },
    docker: { local: '', remote: '' },
  },
  took: 0,
})

test('semantic version comparison does not flatten version numbers', () => {
  assert.equal(compareVersions('4.10.0', '4.9.9'), 1)
  assert.equal(compareVersions('v4.5', '4.5.0'), 0)
  assert.equal(compareVersions('4.5.0-rc.2', '4.5.0-rc.10'), -1)
  assert.equal(compareVersions('4.5.0-rc.10', '4.5.0'), -1)
  assert.throws(() => compareVersions('4..5', '4.5'))
})

test('Pi-hole v6 update detection uses the current component fields', () => {
  assert.equal(
    hasPiHoleUpdate(
      versions(['v6.1.0', 'v6.2.0', 'v6.3.0'], ['v6.1.0', 'v6.2.0', 'v6.3.0']),
    ),
    false,
  )
  assert.equal(
    hasPiHoleUpdate(
      versions(['v6.1.0', 'v6.2.0', 'v6.3.0'], ['v6.1.1', 'v6.2.0', 'v6.3.0']),
    ),
    true,
  )
})
