import assert from 'node:assert/strict'
import test from 'node:test'
import ApiList from '../src/api/enum/ApiList.ts'
import {
  createAdGuardRule,
  escapeAdGuardClientName,
  evaluateAdGuardReason,
  mergeAdGuardRuleRollback,
  planAdGuardRuleMutation,
} from '../src/service/AdGuardHomeRules.ts'
import {
  getAdGuardHomeApiBase,
  normalizeAdGuardHomeAddress,
} from '../src/service/ConnectorUrl.ts'
import AdGuardHomeApiService from '../src/service/AdGuardHomeApiService.ts'
import { ConnectorType } from '../src/service/StorageService.ts'

const adGuardInstance = {
  connector_type: ConnectorType.adguardHome,
  pi_uri_base: 'https://dns.example.test/reverse',
  username: 'admin',
  api_key: 'secret with spaces',
}

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

test('AdGuard Home addresses preserve reverse-proxy paths', () => {
  assert.equal(
    normalizeAdGuardHomeAddress(' https://dns.example.test/wormhole/ '),
    'https://dns.example.test/wormhole',
  )
  assert.equal(
    getAdGuardHomeApiBase('https://dns.example.test/wormhole'),
    'https://dns.example.test/wormhole/control/',
  )
  assert.equal(
    getAdGuardHomeApiBase('https://dns.example.test/wormhole/control/'),
    'https://dns.example.test/wormhole/control/',
  )
})

test('AdGuard Home rules use canonical DNS and escaped client syntax', () => {
  assert.equal(
    createAdGuardRule(ApiList.blacklist, 'Example.ORG.', 'Kids, TV'),
    "||example.org^$client='Kids\\, TV'",
  )
  assert.equal(
    createAdGuardRule(ApiList.whitelist, 'example.org', "Child's TV"),
    "@@||example.org^$client='Child\\'s TV'",
  )
  assert.equal(escapeAdGuardClientName('A|B\\C'), 'A\\|B\\\\C')
  assert.throws(() => createAdGuardRule(ApiList.blacklist, 'bad^rule'))
})

test('rule mutation preserves every unrelated and complex AdGuard rule', () => {
  const original = [
    '# custom comment',
    '/advertising[0-9]+\\.example/',
    "||example.org^$client='TV'",
    '@@||unrelated.example^',
  ]
  const mutation = planAdGuardRuleMutation(
    original,
    ApiList.whitelist,
    'example.org',
    'TV',
  )
  assert.deepEqual(mutation.expectedRules, [
    '# custom comment',
    '/advertising[0-9]+\\.example/',
    "@@||example.org^$client='TV'",
    '@@||unrelated.example^',
  ])
  assert.deepEqual(
    mergeAdGuardRuleRollback(mutation.expectedRules, mutation),
    original,
  )
})

test('rule rollback keeps unrelated concurrent edits and skips newer decisions', () => {
  const mutation = planAdGuardRuleMutation(
    ['||old.example^'],
    ApiList.blacklist,
    'example.org',
  )
  assert.deepEqual(
    mergeAdGuardRuleRollback(
      [...mutation.expectedRules, '@@||concurrent.example^'],
      mutation,
    ),
    ['||old.example^', '@@||concurrent.example^'],
  )
  assert.equal(mergeAdGuardRuleRollback(['@@||example.org^'], mutation), null)
})

test('AdGuard filtering reasons map conservatively to toolbar states', () => {
  assert.equal(evaluateAdGuardReason('FilteredBlackList'), 'blocked')
  assert.equal(evaluateAdGuardReason('FilteredSafeBrowsing'), 'blocked')
  assert.equal(evaluateAdGuardReason('NotFilteredWhiteList'), 'allowed')
  assert.equal(evaluateAdGuardReason('Rewrite'), 'allowed')
  assert.equal(evaluateAdGuardReason('NotFilteredError'), 'unknown')
  assert.equal(evaluateAdGuardReason(undefined), 'unknown')
})

test('AdGuard rule writes authenticate, preserve the proxy path, and verify', async () => {
  let rules = ['||old.example^']
  const requests: Request[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const request = input as Request
    requests.push(request.clone())
    const url = new URL(request.url)
    if (url.pathname.endsWith('/control/filtering/status')) {
      return jsonResponse({ user_rules: rules })
    }
    if (url.pathname.endsWith('/control/filtering/set_rules')) {
      const body = (await request.json()) as { rules: string[] }
      rules = [...body.rules]
      return jsonResponse({})
    }
    return new Response('not found', { status: 404 })
  }

  try {
    const mutation = await AdGuardHomeApiService.prepareRuleMutation(
      adGuardInstance,
      ApiList.whitelist,
      'example.org',
    )
    await AdGuardHomeApiService.applyRuleMutation(adGuardInstance, mutation)

    assert.deepEqual(rules, ['||old.example^', '@@||example.org^'])
    assert.equal(
      requests.every((request) =>
        new URL(request.url).pathname.startsWith('/reverse/control/'),
      ),
      true,
    )
    assert.equal(
      requests.every(
        (request) =>
          request.headers.get('authorization') ===
          `Basic ${btoa('admin:secret with spaces')}`,
      ),
      true,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AdGuard rule writes stop before POST when custom rules changed', async () => {
  let rules = ['||old.example^']
  let postCount = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const request = input as Request
    const url = new URL(request.url)
    if (url.pathname.endsWith('/control/filtering/status')) {
      return jsonResponse({ user_rules: rules })
    }
    if (url.pathname.endsWith('/control/filtering/set_rules')) {
      postCount += 1
      return jsonResponse({})
    }
    return new Response('not found', { status: 404 })
  }

  try {
    const mutation = await AdGuardHomeApiService.prepareRuleMutation(
      adGuardInstance,
      ApiList.blacklist,
      'example.org',
    )
    rules = [...rules, '# changed elsewhere']
    await assert.rejects(
      AdGuardHomeApiService.applyRuleMutation(adGuardInstance, mutation),
      /changed concurrently/,
    )
    assert.equal(postCount, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AdGuard native protection pause uses milliseconds', async () => {
  let status = {
    protection_enabled: true,
    protection_disabled_duration: 0,
    running: true,
    version: 'v0.107.65',
  }
  let protectionBody: unknown
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const request = input as Request
    const url = new URL(request.url)
    if (url.pathname.endsWith('/control/protection')) {
      protectionBody = await request.json()
      status = {
        ...status,
        protection_enabled: false,
        protection_disabled_duration: 30_000,
      }
      return jsonResponse({})
    }
    if (url.pathname.endsWith('/control/status')) {
      return jsonResponse(status)
    }
    return new Response('not found', { status: 404 })
  }

  try {
    await AdGuardHomeApiService.setProtectionFor(adGuardInstance, false, 30)
    assert.deepEqual(protectionBody, { enabled: false, duration: 30_000 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AdGuard persistent-client pauses preserve and restore full client settings', async () => {
  let client = {
    name: 'Kids',
    ids: ['192.0.2.10'],
    use_global_settings: true,
    filtering_enabled: true,
    tags: ['user_child'],
    upstreams: ['https://dns.example/dns-query'],
  }
  const updateBodies: unknown[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const request = input as Request
    const url = new URL(request.url)
    if (url.pathname.endsWith('/control/clients')) {
      return jsonResponse({ clients: [client] })
    }
    if (url.pathname.endsWith('/control/clients/update')) {
      const body = (await request.json()) as {
        name: string
        data: typeof client
      }
      updateBodies.push(body)
      client = structuredClone(body.data)
      return jsonResponse({})
    }
    return new Response('not found', { status: 404 })
  }

  try {
    const original = structuredClone(client)
    const mutation = AdGuardHomeApiService.prepareClientMutation(client, false)
    await AdGuardHomeApiService.applyClientMutation(adGuardInstance, mutation)

    assert.equal(client.use_global_settings, false)
    assert.equal(client.filtering_enabled, false)
    assert.deepEqual(client.tags, original.tags)
    assert.deepEqual(client.upstreams, original.upstreams)

    await AdGuardHomeApiService.restoreClientMutation(adGuardInstance, mutation)
    assert.deepEqual(client, original)
    assert.equal(updateBodies.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
