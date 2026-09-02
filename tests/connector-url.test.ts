import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAdGuardHomeApiBase,
  normalizeAdGuardHomeAddress,
} from '../src/service/ConnectorUrl.ts'

test('AdGuard Home addresses preserve root, control, and reverse-proxy prefixes', () => {
  assert.equal(
    normalizeAdGuardHomeAddress(' https://dns.example.test/// '),
    'https://dns.example.test',
  )
  assert.equal(
    getAdGuardHomeApiBase('https://dns.example.test'),
    'https://dns.example.test/control/',
  )
  assert.equal(
    getAdGuardHomeApiBase('https://dns.example.test/control/'),
    'https://dns.example.test/control/',
  )
  assert.equal(
    getAdGuardHomeApiBase('https://dns.example.test/reverse/control'),
    'https://dns.example.test/reverse/control/',
  )
  assert.equal(
    getAdGuardHomeApiBase('https://dns.example.test/reverse'),
    'https://dns.example.test/reverse/control/',
  )
})
