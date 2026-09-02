import assert from 'node:assert/strict'
import { createServer } from 'node:http'
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

const requestHopByHopHeaders = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const responseHopByHopHeaders = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
])

const startPrefixProxy = async (
  targetPort: 18080 | 18081,
  prefix: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  const normalizedPrefix = `/${prefix.replace(/^\/+|\/+$/g, '')}`
  const upstreamOrigin =
    targetPort === 18080
      ? 'http://127.0.0.1:18080'
      : 'http://127.0.0.1:18081'

  const server = createServer((incoming, outgoing) => {
    void (async () => {
      try {
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

        const headers = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (
            typeof value === 'undefined' ||
            requestHopByHopHeaders.has(name.toLowerCase())
          ) {
            continue
          }
          headers.set(name, Array.isArray(value) ? value.join(', ') : value)
        }
        headers.set('accept-encoding', 'identity')

        const chunks: Buffer[] = []
        for await (const chunk of incoming) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const body = Buffer.concat(chunks)

        const upstreamUrl = new URL(upstreamOrigin)
        upstreamUrl.pathname = upstreamPath
        upstreamUrl.search = requestUrl.search

        const response = await fetch(upstreamUrl, {
          method: incoming.method,
          headers,
          body:
            incoming.method === 'GET' || incoming.method === 'HEAD'
              ? undefined
              : body,
          redirect: 'manual',
        })

        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, name) => {
          if (!responseHopByHopHeaders.has(name.toLowerCase())) {
            responseHeaders[name] = value
          }
        })
        outgoing.writeHead(response.status, responseHeaders)
        outgoing.end(Buffer.from(await response.arrayBuffer()))
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason)
        if (!outgoing.headersSent) {
          outgoing.writeHead(502)
        }
        outgoing.end(message)
      }
    })()
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
    startPrefixProxy(18080, 'wormhole-pihole'),
    startPrefixProxy(18081, 'wormhole-adguard'),
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
