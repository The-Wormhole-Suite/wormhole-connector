import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  composeToolbarIconState,
  formatTemporaryBadgeText,
  getToolbarBadgePresentation,
} from '../src/service/BadgeState.ts'

test('blocked domains replace an active icon with the blocked variant', () => {
  assert.equal(composeToolbarIconState('active', 'blocked'), 'blocked')
})

test('allowed domains keep the active variant', () => {
  assert.equal(composeToolbarIconState('active', 'allowed'), 'active')
})

test('temporary domain rules use the temporary variant', () => {
  assert.equal(composeToolbarIconState('active', 'temporary'), 'temporary')
})

test('disabled and error states override domain states', () => {
  assert.equal(composeToolbarIconState('disabled', 'blocked'), 'disabled')
  assert.equal(composeToolbarIconState('error', 'temporary'), 'error')
})

test('unknown global or domain states use the unknown variant', () => {
  assert.equal(composeToolbarIconState('unknown', 'allowed'), 'unknown')
  assert.equal(composeToolbarIconState('active', 'unknown'), 'unknown')
})

test('native toolbar badges use short, distinct status labels', () => {
  assert.deepEqual(getToolbarBadgePresentation('active'), {
    text: '✓',
    backgroundColor: '#16A34A',
    textColor: '#FFFFFF',
  })
  assert.equal(getToolbarBadgePresentation('blocked').text, '×')
  assert.equal(getToolbarBadgePresentation('disabled').text, 'OFF')
  assert.equal(getToolbarBadgePresentation('error').text, '!')
  assert.deepEqual(
    getToolbarBadgePresentation('unknown'),
    getToolbarBadgePresentation('error'),
  )
})

test('temporary badge text remains within the native four-character limit', () => {
  assert.equal(formatTemporaryBadgeText(null), '…')
  assert.equal(formatTemporaryBadgeText(45), '45s')
  assert.equal(formatTemporaryBadgeText(300), '5m')
  assert.equal(formatTemporaryBadgeText(7200), '2h')
  assert.equal(formatTemporaryBadgeText(259200), '3d')
  assert.equal(formatTemporaryBadgeText(1000 * 86400), '>99d')

  for (const seconds of [1, 59, 60, 3599, 3600, 86399, 86400]) {
    assert.ok(formatTemporaryBadgeText(seconds).length <= 4)
  }
})

test('all popup status icon variants exist in 16, 32 and 48 pixels', async () => {
  const states = [
    'unknown',
    'active',
    'blocked',
    'temporary',
    'disabled',
    'error',
  ]

  for (const state of states) {
    for (const size of [16, 32, 48]) {
      const fileName = `icon/status/${state}-${size}.png`
      const buffer = await readFile(fileName)
      assert.equal(buffer.readUInt32BE(16), size, `${fileName} width`)
      assert.equal(buffer.readUInt32BE(20), size, `${fileName} height`)
    }
  }

  for (const size of [16, 32, 48]) {
    assert.deepEqual(
      await readFile(`icon/status/unknown-${size}.png`),
      await readFile(`icon/status/error-${size}.png`),
      `unknown-${size}.png uses the shared error/unknown artwork`,
    )
  }
})
