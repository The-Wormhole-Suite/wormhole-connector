import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const checkOnly = process.argv.includes('--check')
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const outputPath = 'THIRD_PARTY_NOTICES.txt'
const bundledToolingRoots = [
  '@mdi/js',
  'css-loader',
  'mini-css-extract-plugin',
  'webpack',
]
const rootPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...bundledToolingRoots,
])
const packagePaths = collectDependencyGraph(rootPackages, packageLock.packages)
const sections = []

for (const packagePath of [...packagePaths].sort()) {
  const directory = packagePath
  const metadata = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  )
  const licenseText = await readLicenseText(directory)
  const repository = normalizeRepository(metadata.repository)
  sections.push(
    [
      `${metadata.name}@${metadata.version}`,
      `License: ${normalizeLicense(metadata.license ?? metadata.licenses)}`,
      repository ? `Source: ${repository}` : null,
      '',
      licenseText,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  )
}

const output = [
  'THIRD-PARTY SOFTWARE NOTICES',
  '',
  'This file is generated from package-lock.json and installed package metadata.',
  'It covers packages shipped in the browser bundles, including loader/runtime code.',
  '',
  ...sections.flatMap((section, index) => [
    index === 0 ? '' : '\n',
    '='.repeat(78),
    section,
  ]),
  '',
].join('\n')

if (checkOnly) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '')
  if (existing !== output) {
    throw new Error(
      `${outputPath} is outdated. Run npm run notices:generate and commit the result.`,
    )
  }
  console.log(`${outputPath} is current.`)
} else {
  await writeFile(outputPath, output)
  console.log(`Generated ${outputPath} for ${packagePaths.size} packages.`)
}

function collectDependencyGraph(roots, lockPackages) {
  const collected = new Set()
  const queue = [...roots].map((packageName) => `node_modules/${packageName}`)

  while (queue.length > 0) {
    const packagePath = queue.shift()
    if (!packagePath || collected.has(packagePath)) {
      continue
    }
    const entry = lockPackages[packagePath]
    if (!entry) {
      throw new Error(
        `Package ${packagePath} is missing from package-lock.json`,
      )
    }
    collected.add(packagePath)
    queue.push(
      ...Object.keys(entry.dependencies ?? {}).map((dependency) =>
        resolveDependencyPath(packagePath, dependency, lockPackages),
      ),
    )
  }

  return collected
}

function resolveDependencyPath(packagePath, dependency, lockPackages) {
  let currentPath = packagePath
  while (currentPath) {
    const nestedCandidate = `${currentPath}/node_modules/${dependency}`
    if (lockPackages[nestedCandidate]) {
      return nestedCandidate
    }

    const parentNodeModules = currentPath.lastIndexOf('/node_modules/')
    if (parentNodeModules < 0) {
      break
    }
    currentPath = currentPath.slice(0, parentNodeModules)
  }

  const rootCandidate = `node_modules/${dependency}`
  if (lockPackages[rootCandidate]) {
    return rootCandidate
  }
  throw new Error(
    `Dependency ${dependency} required by ${packagePath} is missing from package-lock.json`,
  )
}

async function readLicenseText(directory) {
  const entries = await readdir(directory)
  const licenseFile = entries
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:\..+)?$/i.test(name))
    .sort((left, right) => left.length - right.length)[0]
  if (!licenseFile) {
    return 'No standalone license file was included in the installed package.'
  }
  return (await readFile(path.join(directory, licenseFile), 'utf8')).trim()
}

function normalizeLicense(license) {
  if (typeof license === 'string') {
    return license
  }
  if (Array.isArray(license)) {
    return license
      .map((entry) => (typeof entry === 'string' ? entry : entry.type))
      .filter(Boolean)
      .join(' OR ')
  }
  return 'Not specified in package metadata'
}

function normalizeRepository(repository) {
  const value =
    typeof repository === 'string' ? repository : (repository?.url ?? '')
  return value.replace(/^git\+/, '').replace(/\.git$/, '')
}
