import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const artifactDirectory = 'artifacts'
const artifacts = [
  {
    destination: `wormhole-connector-${packageJson.version}-firefox-unsigned.xpi`,
    source: 'package.firefox.zip',
  },
  {
    destination: `wormhole-connector-${packageJson.version}-chrome.zip`,
    source: 'package.chrome.zip',
  },
]

await rm(artifactDirectory, { force: true, recursive: true })
await mkdir(artifactDirectory, { recursive: true })

const checksumLines = []
for (const artifact of artifacts) {
  const destinationPath = path.join(artifactDirectory, artifact.destination)
  await copyFile(artifact.source, destinationPath)
  const checksum = createHash('sha256')
    .update(await readFile(destinationPath))
    .digest('hex')
  checksumLines.push(`${checksum}  ${artifact.destination}`)
}

const { stdout: statusOutput } = await execFileAsync('git', [
  'status',
  '--porcelain',
])
if (statusOutput.trim()) {
  throw new Error(
    'Source archive requires a clean Git worktree so it matches one exact commit.',
  )
}

const { stdout: commitOutput } = await execFileAsync('git', [
  'rev-parse',
  'HEAD',
])
const commit = commitOutput.trim()
const sourceDirectory = `wormhole-connector-${packageJson.version}-source`
const sourceArchive = `${sourceDirectory}.zip`
const sourceArchivePath = path.join(artifactDirectory, sourceArchive)
await execFileAsync('git', [
  'archive',
  '--format=zip',
  `--prefix=${sourceDirectory}/`,
  `--add-virtual-file=${sourceDirectory}/SOURCE_COMMIT.txt:${commit}`,
  `--output=${sourceArchivePath}`,
  'HEAD',
])
checksumLines.push(
  `${createHash('sha256')
    .update(await readFile(sourceArchivePath))
    .digest('hex')}  ${sourceArchive}`,
)

await writeFile(
  path.join(artifactDirectory, 'SHA256SUMS.txt'),
  `${checksumLines.sort().join('\n')}\n`,
)

console.log(`Prepared release artifacts for version ${packageJson.version}.`)
