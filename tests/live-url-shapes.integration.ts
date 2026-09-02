import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import test from 'node:test'
import AdGuardHomeApiService from '../src/service/AdGuardHomeApiService'
import PiHoleApiService from '../src/service/PiHoleApiService'
import {
  ConnectorType,
  type ConnectorSettingsStorage,
} from '../src/service/StorageService'

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: { storage: {} },
})

const requiredEnv = (name: string): string => {
  const value = process.env[name]
  if (typeof value === 'undefined') {
    throw new Error(`${name} is required for live backend integration tests`)
  }
  return value
}

const piHole: ConnectorSettingsStorage = {
  connector_type: ConnectorType.piHole,
  pi_uri_base: requiredEnv('PIHOLE_URL'),
  api_key: requiredEnv('PIHOLE_PASSWORD'),
}

const adGuard: ConnectorSettingsStorage = {
  connector_type: ConnectorType.adguardHome,
  pi_uri_base: requiredEnv('ADGUARD_URL'),
  username: requiredEnv('ADGUARD_USERNAME'),
  api_key: requiredEnv('ADGUARD_PASSWORD'),
}

const startPrefixProxy = async (
  targetBaseUrl: string,
  prefix: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  const target = new URL(targetBaseUrl)
  if (target.protocol !== 'http:') {
    throw new Error('Live prefix proxy expects the local HTTP test backends')
  }
  const normalizedPrefix = `/${prefix.replace(/^\/+|\/+$/g, '')}`
  const server = createServer((incoming, outgoing) => {
    const requestUrl = new URL(incoming.url ?? '/', 'http://proxy.invalid')
    let upstreamPath: string | undefined
    if (requestUrl.pathname === normalizedPrefix) {
      upstreamPath = '/'
    } else if (requestUrl.pathname.startsWith(`${normalizedPrefix}/`)) {
      upstreamPath = requestUrl.pathname.slice(normalizedPrefix.length)
    }

    if (!upstreamPath) {
      outgoing.writeHead(404).end('Unknown proxy prefix')
      return
    }

    const upstreamUrl = new URL(`${upstreamPath}${requestUrl.search}`, target)
    const upstream = httpRequest(
      upstreamUrl,
      {
        method: incoming.method,
        headers: { ...incoming.headers, host: upstreamUrl.host },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(outgoing)
      },
    )
    upstream.on('error', (reason) => {
      outgoing.writeHead(502).end(reason.message)
    })
    incoming.pipe(upstream)
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (reason: Error) => reject(reason)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Prefix proxy did not expose a TCP port')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}${normalizedPrefix}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((reason) => (reason ? reject(reason) : resolve()))
      }),
  }
}

test('Pi-hole /admin and /api URL endings work against the live v6 API', async () => {
  const root = piHole.pi_uri_base!.replace(/\/+$/g, '')

  for (const suffix of ['/admin', '/api']) {
    const instance: ConnectorSettingsStorage = {
      ...piHole,
      pi_uri_base: `${root}${suffix}`,
    }
    try {
      const version = await PiHoleApiService.getPiHoleVersion(instance)
      assert.equal(version.status, 200)
      assert.ok(version.data.version.ftl.local.version)
    } finally {
      await PiHoleApiService.endSession(instance)
    }
  }
})

test('AdGuard Home /control URL ending works against the live API', async () => {
  const root = adGuard.pi_uri_base!.replace(/\/+$/g, '')
  const instance: ConnectorSettingsStorage = {
    ...adGuard,
    pi_uri_base: `${root}/control`,
  }

  const status = await AdGuardHomeApiService.getStatusFor(instance)
  assert.equal(status.running, true)
  assert.ok(status.version)
})

test('custom reverse-proxy prefixes work against both live backends', async () => {
  const [piHoleProxy, adGuardProxy] = await Promise.all([
    startPrefixProxy(piHole.pi_uri_base!, 'wormhole-pihole'),
    startPrefixProxy(adGuard.pi_uri_base!, 'wormhole-adguard'),
  ])
  const proxiedPiHole: ConnectorSettingsStorage = {
    ...piHole,
    pi_uri_base: `${piHoleProxy.baseUrl}/admin`,
  }
  const proxiedAdGuard: ConnectorSettingsStorage = {
    ...adGuard,
    pi_uri_base: `${adGuardProxy.baseUrl}/control`,
  }

  try {
    const version = await PiHoleApiService.getPiHoleVersion(proxiedPiHole)
    assert.equal(version.status, 200)
    assert.ok(version.data.version.ftl.local.version)

    const status = await AdGuardHomeApiService.getStatusFor(proxiedAdGuard)
    assert.equal(status.running, true)
    assert.ok(status.version)
  } finally {
    await PiHoleApiService.endSession(proxiedPiHole)
    await Promise.all([piHoleProxy.close(), adGuardProxy.close()])
  }
})
