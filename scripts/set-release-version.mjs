import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  manifestVersionFor,
  parseReleaseVersion,
} from './release-version.mjs'

const RELEASE_FILES = {
  package: 'package.json',
  lock: 'package-lock.json',
  firefox: 'manifest.firefox.json',
  chrome: 'manifest.chrome.json',
}

export async function setReleaseVersion(version, rootDir = process.cwd()) {
  parseReleaseVersion(version)
  const manifestVersion = manifestVersionFor(version)

  const fileEntries = await Promise.all(
    Object.entries(RELEASE_FILES).map(async ([key, relativePath]) => {
      const filePath = path.join(rootDir, relativePath)
      const content = await readFile(filePath, 'utf8')
      return [key, filePath, JSON.parse(content)]
    }),
  )

  const files = Object.fromEntries(
    fileEntries.map(([key, filePath, value]) => [
      key,
      { filePath, value },
    ]),
  )

  if (!files.lock.value.packages?.['']) {
    throw new Error('package-lock.json is missing the root package entry.')
  }

  files.package.value.version = version
  files.lock.value.version = version
  files.lock.value.packages[''].version = version

  for (const manifest of [files.firefox.value, files.chrome.value]) {
    manifest.version = manifestVersion
    manifest.version_name = version
  }

  await Promise.all(
    Object.values(files).map(({ filePath, value }) =>
      writeFile(filePath, stringifyJson(value), 'utf8'),
    ),
  )

  return { version, manifestVersion }
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, '\t')}\n`
}

const invokedPath = process.argv[1]
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const version = process.argv[2]
  if (!version) {
    throw new Error(
      'Expected a release version argument, for example 5.2.0 or 5.2.0-rc.1.',
    )
  }

  const result = await setReleaseVersion(version)
  console.log(
    `Set release version ${result.version} (manifest ${result.manifestVersion}).`,
  )
}
