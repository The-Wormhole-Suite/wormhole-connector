import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPrereleaseVersion,
  manifestVersionFor,
  parseReleaseVersion,
} from '../scripts/release-version.mjs'

test('encodes prereleases below their stable release', () => {
  assert.equal(manifestVersionFor('5.1.0-alpha.1'), '5.1.0.10001')
  assert.equal(manifestVersionFor('5.1.0-beta.2'), '5.1.0.20002')
  assert.equal(manifestVersionFor('5.1.0-rc.3'), '5.1.0.30003')
  assert.equal(manifestVersionFor('5.1.0'), '5.1.0.65535')
})

test('keeps release ordering monotonic', () => {
  const fourth = (version) => Number(manifestVersionFor(version).split('.')[3])

  assert.ok(fourth('5.1.0-alpha.9') < fourth('5.1.0-beta.1'))
  assert.ok(fourth('5.1.0-beta.9') < fourth('5.1.0-rc.1'))
  assert.ok(fourth('5.1.0-rc.9') < fourth('5.1.0'))
})

test('identifies stable and prerelease versions', () => {
  assert.equal(isPrereleaseVersion('5.1.0'), false)
  assert.equal(isPrereleaseVersion('5.1.0-beta.2'), true)
})

test('rejects unsupported or store-incompatible versions', () => {
  assert.throws(() => parseReleaseVersion('5.1.0-preview.1'))
  assert.throws(() => parseReleaseVersion('5.1.0-beta.0'))
  assert.throws(() => parseReleaseVersion('65536.0.0'))
  assert.throws(() => parseReleaseVersion('5.1.0-beta.10000'))
  assert.throws(() => parseReleaseVersion('05.1.0'))
})
