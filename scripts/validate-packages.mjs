import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

const browserBuilds = [
  {
    archivePath: 'package.firefox.zip',
    browser: 'firefox',
    expectedManifestVersion: 2,
    sourceManifestPath: 'manifest.firefox.json',
  },
  {
    archivePath: 'package.chrome.zip',
    browser: 'chrome',
    expectedManifestVersion: 3,
    sourceManifestPath: 'manifest.chrome.json',
  },
]

for (const build of browserBuilds) {
  await validateBuild(build)
}

console.log('Browser package structure validated successfully.')

async function validateBuild({
  archivePath,
  browser,
  expectedManifestVersion,
  sourceManifestPath,
}) {
  const outputDirectory = path.join('dist', browser)
  const builtManifestPath = path.join(outputDirectory, 'manifest.json')
  const builtManifest = JSON.parse(await readFile(builtManifestPath, 'utf8'))
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'))

  assertEqual(
    builtManifest.manifest_version,
    expectedManifestVersion,
    `${browser} manifest version`,
  )
  assertEqual(
    sourceManifest.manifest_version,
    expectedManifestVersion,
    `${browser} source manifest version`,
  )
  assertEqual(builtManifest.version, packageJson.version, `${browser} version`)
  assertEqual(
    sourceManifest.version,
    packageJson.version,
    `${browser} source version`,
  )

  const outputFiles = await listFiles(outputDirectory)
  const outputFileSet = new Set(outputFiles)

  for (const requiredLegalFile of [
    'LICENSE.txt',
    'NOTICE.txt',
    'CREDITS.txt',
    'PRIVACY.txt',
    'THIRD_PARTY_NOTICES.txt',
  ]) {
    assert(
      outputFileSet.has(requiredLegalFile),
      `${browser} package is missing ${requiredLegalFile}`,
    )
  }

  const localeDirectories = outputFiles
    .filter((fileName) => /^_locales\/[^/]+\/messages\.json$/.test(fileName))
    .map((fileName) => fileName.split('/')[1])
    .sort()
  assertSameFiles(
    ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt_BR'],
    localeDirectories,
    `${browser} locales`,
  )

  for (const requiredPath of collectManifestPaths(builtManifest)) {
    assert(
      outputFileSet.has(requiredPath),
      `${browser} package is missing manifest reference: ${requiredPath}`,
    )
  }

  const defaultLocale = builtManifest.default_locale
  if (defaultLocale) {
    const localeMessages = `_locales/${defaultLocale}/messages.json`
    assert(
      outputFileSet.has(localeMessages),
      `${browser} package is missing default locale: ${localeMessages}`,
    )
  }

  for (const [size, iconPath] of Object.entries(collectIcons(builtManifest))) {
    const iconBuffer = await readFile(path.join(outputDirectory, iconPath))
    const dimensions = readPngDimensions(iconBuffer, iconPath)
    const expectedSize = Number(size)
    assertEqual(dimensions.width, expectedSize, `${iconPath} width`)
    assertEqual(dimensions.height, expectedSize, `${iconPath} height`)
  }

  const forbiddenFile = outputFiles.find((fileName) =>
    /(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|tests?|scripts?|src)(?:\/|$)|\.(?:map|ts|tsx|vue|scss|md)$/i.test(
      fileName,
    ),
  )
  assert(
    !forbiddenFile,
    `${browser} package contains an unexpected development file: ${forbiddenFile}`,
  )

  const archiveEntries = readZipEntries(await readFile(archivePath)).filter(
    (entry) => !entry.endsWith('/'),
  )
  assertSameFiles(outputFiles, archiveEntries, browser)
}

async function listFiles(directory, relativeDirectory = '') {
  const directoryEntries = await readdir(
    path.join(directory, relativeDirectory),
    {
      withFileTypes: true,
    },
  )
  const files = []

  for (const directoryEntry of directoryEntries) {
    const relativePath = path.posix.join(relativeDirectory, directoryEntry.name)
    if (directoryEntry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)))
    } else if (directoryEntry.isFile()) {
      files.push(relativePath)
    }
  }

  return files.sort()
}

function collectManifestPaths(manifest) {
  const paths = new Set(['manifest.json'])
  const addPath = (value) => {
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      !value.includes('*') &&
      !value.startsWith('http:') &&
      !value.startsWith('https:')
    ) {
      paths.add(value.replace(/^\//, ''))
    }
  }
  const addValues = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addPath)
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(addPath)
    }
  }

  addValues(manifest.icons)
  addValues(manifest.action?.default_icon)
  addValues(manifest.browser_action?.default_icon)
  addPath(manifest.action?.default_popup)
  addPath(manifest.browser_action?.default_popup)
  addPath(manifest.options_page)
  addPath(manifest.options_ui?.page)
  addPath(manifest.background?.page)
  addPath(manifest.background?.service_worker)
  addValues(manifest.background?.scripts)

  for (const contentScript of manifest.content_scripts ?? []) {
    addValues(contentScript.js)
    addValues(contentScript.css)
  }

  for (const resourceEntry of manifest.web_accessible_resources ?? []) {
    if (typeof resourceEntry === 'string') {
      addPath(resourceEntry)
    } else {
      addValues(resourceEntry.resources)
    }
  }

  return [...paths].sort()
}

function collectIcons(manifest) {
  return {
    ...(manifest.icons ?? {}),
    ...(manifest.action?.default_icon ?? {}),
    ...(manifest.browser_action?.default_icon ?? {}),
  }
}

function readPngDimensions(buffer, fileName) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  assert(
    buffer.length >= 24 && buffer.subarray(0, 8).equals(pngSignature),
    `${fileName} is not a valid PNG file`,
  )
  assert(
    buffer.subarray(12, 16).toString('ascii') === 'IHDR',
    `${fileName} does not contain a valid PNG header`,
  )

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function readZipEntries(buffer) {
  const endOfCentralDirectorySignature = 0x06054b50
  const centralDirectorySignature = 0x02014b50
  const minimumEndOffset = Math.max(0, buffer.length - 65_557)
  let endOffset = -1

  for (
    let offset = buffer.length - 22;
    offset >= minimumEndOffset;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      endOffset = offset
      break
    }
  }

  assert(endOffset >= 0, 'ZIP archive has no end-of-central-directory record')

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let offset = buffer.readUInt32LE(endOffset + 16)
  const entries = []

  for (let index = 0; index < entryCount; index += 1) {
    assert(
      buffer.readUInt32LE(offset) === centralDirectorySignature,
      'ZIP archive contains an invalid central-directory entry',
    )
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraFieldLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const fileNameStart = offset + 46
    const fileName = buffer
      .subarray(fileNameStart, fileNameStart + fileNameLength)
      .toString('utf8')
      .replaceAll('\\', '/')
      .replace(/^\.\//, '')
    entries.push(fileName)
    offset = fileNameStart + fileNameLength + extraFieldLength + commentLength
  }

  return entries.sort()
}

function assertSameFiles(outputFiles, archiveEntries, browser) {
  const expected = [...new Set(outputFiles)].sort()
  const actual = [...new Set(archiveEntries)].sort()

  assertEqual(actual.length, expected.length, `${browser} archive file count`)

  for (let index = 0; index < expected.length; index += 1) {
    assertEqual(actual[index], expected[index], `${browser} archive entry`)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label} mismatch: expected ${String(expected)}, received ${String(actual)}`,
  )
}
