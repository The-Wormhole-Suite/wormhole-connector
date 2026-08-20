import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { setReleaseVersion } from '../scripts/set-release-version.mjs'

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wormhole-version-'))

  const files = {
    'package.json': {
      name: 'wormhole-connector',
      version: '5.0.1',
    },
    'package-lock.json': {
      name: 'wormhole-connector',
      version: '5.0.1',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'wormhole-connector',
          version: '5.0.1',
        },
      },
    },
    'manifest.firefox.json': {
      manifest_version: 2,
      version: '5.0.1',
    },
    'manifest.chrome.json': {
      manifest_version: 3,
      version: '5.0.1',
    },
  }

  for (const [fileName, value] of Object.entries(files)) {
    await writeFile(
      path.join(root, fileName),
      `${JSON.stringify(value, null, '\t')}\n`,
      'utf8',
    )
  }

  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function readJson(root, fileName) {
  return JSON.parse(await readFile(path.join(root, fileName), 'utf8'))
}

test('sets package, lockfile, and manifest versions together', async () => {
  await withFixture(async (root) => {
    const result = await setReleaseVersion('6.2.0-beta.7', root)

    assert.deepEqual(result, {
      version: '6.2.0-beta.7',
      manifestVersion: '6.2.0.20007',
    })

    const packageJson = await readJson(root, 'package.json')
    const packageLock = await readJson(root, 'package-lock.json')
    const firefoxManifest = await readJson(root, 'manifest.firefox.json')
    const chromeManifest = await readJson(root, 'manifest.chrome.json')

    assert.equal(packageJson.version, '6.2.0-beta.7')
    assert.equal(packageLock.version, '6.2.0-beta.7')
    assert.equal(packageLock.packages[''].version, '6.2.0-beta.7')

    for (const manifest of [firefoxManifest, chromeManifest]) {
      assert.equal(manifest.version, '6.2.0.20007')
      assert.equal(manifest.version_name, '6.2.0-beta.7')
    }
  })
})

test('rejects invalid release versions before writing files', async () => {
  await withFixture(async (root) => {
    const before = await readFile(path.join(root, 'package.json'), 'utf8')

    await assert.rejects(() => setReleaseVersion('6.2.0-preview.1', root))

    const after = await readFile(path.join(root, 'package.json'), 'utf8')
    assert.equal(after, before)
  })
})

test('rejects malformed lockfiles before writing any release file', async () => {
  await withFixture(async (root) => {
    const lockPath = path.join(root, 'package-lock.json')
    const packagePath = path.join(root, 'package.json')
    const before = await readFile(packagePath, 'utf8')

    await writeFile(lockPath, '{"packages":{}}\n', 'utf8')
    await assert.rejects(
      () => setReleaseVersion('6.2.0', root),
      /missing the root package entry/,
    )

    const after = await readFile(packagePath, 'utf8')
    assert.equal(after, before)
  })
})
