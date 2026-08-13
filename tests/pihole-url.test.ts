import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPiHoleApiBase,
  isValidPiHoleAddress,
  normalizePiHoleAddress,
} from '../src/service/PiHoleUrl.ts'

test('Pi-hole addresses preserve reverse-proxy paths', () => {
  assert.equal(
    normalizePiHoleAddress(' https://dns.example.test/wormhole/admin/// '),
    'https://dns.example.test/wormhole/admin',
  )
  assert.equal(
    getPiHoleApiBase('https://dns.example.test/wormhole/admin'),
    'https://dns.example.test/wormhole/api/',
  )
  assert.equal(
    getPiHoleApiBase('https://dns.example.test/wormhole/api/'),
    'https://dns.example.test/wormhole/api/',
  )
  assert.equal(
    getPiHoleApiBase('http://192.0.2.1:8080'),
    'http://192.0.2.1:8080/api/',
  )
})

test('Pi-hole address validation uses URL parsing and rejects unsafe forms', () => {
  for (const invalid of [
    '',
    'pi.hole/admin',
    'ftp://pi.hole/admin',
    'https://user:secret@pi.hole/admin',
    'https://pi.hole/admin?next=api',
    'https://pi.hole/admin#api',
  ]) {
    assert.equal(isValidPiHoleAddress(invalid), false, invalid)
  }

  assert.equal(isValidPiHoleAddress('http://pi.hole/admin'), true)
})
