import { manifestVersionFor } from './release-version.mjs'
import { readFile } from 'node:fs/promises'

const tag = process.argv[2]
if (!tag) {
  throw new Error(
    'Expected a release tag argument, for example v4.2.0 or v4.2.0-rc.1.',
  )
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const firefoxManifest = JSON.parse(
  await readFile('manifest.firefox.json', 'utf8'),
)
const chromeManifest = JSON.parse(
  await readFile('manifest.chrome.json', 'utf8'),
)

const expectedTag = `v${packageJson.version}`
if (tag !== expectedTag) {
  throw new Error(
    `release tag mismatch: expected ${expectedTag}, received ${tag}`,
  )
}

const expectedManifestVersion = manifestVersionFor(packageJson.version)
assertEqual(
  firefoxManifest.version,
  expectedManifestVersion,
  'Firefox version',
)
assertEqual(
  chromeManifest.version,
  expectedManifestVersion,
  'Chrome version',
)
assertEqual(
  firefoxManifest.version_name,
  packageJson.version,
  'Firefox version_name',
)
assertEqual(
  chromeManifest.version_name,
  packageJson.version,
  'Chrome version_name',
)

console.log(`Release versions are consistent for ${tag}.`)

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch: expected ${String(expected)}, received ${String(actual)}`,
    )
  }
}
