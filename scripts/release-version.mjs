import { fileURLToPath } from 'node:url'

const STABLE_SLOT = 65535
const PRERELEASE_SLOTS = {
  alpha: 10000,
  beta: 20000,
  rc: 30000,
}
const MAX_PRERELEASE_NUMBER = 9999
const MAX_COMPONENT = 65535
const RELEASE_VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(alpha|beta|rc)\.([1-9][0-9]*))?$/

export function parseReleaseVersion(version) {
  const match = RELEASE_VERSION_PATTERN.exec(version)

  if (!match) {
    throw new Error(
      `Unsupported release version ${version}. Expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-(alpha|beta|rc).N.`,
    )
  }

  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const stage = match[4] ?? null
  const prereleaseNumber = match[5] ? Number(match[5]) : null

  for (const [label, value] of [
    ['major', major],
    ['minor', minor],
    ['patch', patch],
  ]) {
    if (!Number.isSafeInteger(value) || value > MAX_COMPONENT) {
      throw new Error(
        `Release ${label} component must be between 0 and ${MAX_COMPONENT}.`,
      )
    }
  }

  if (
    prereleaseNumber !== null &&
    (!Number.isSafeInteger(prereleaseNumber) ||
      prereleaseNumber < 1 ||
      prereleaseNumber > MAX_PRERELEASE_NUMBER)
  ) {
    throw new Error(
      `Prerelease number must be between 1 and ${MAX_PRERELEASE_NUMBER}.`,
    )
  }

  return { major, minor, patch, stage, prereleaseNumber }
}

export function manifestVersionFor(version) {
  const parsed = parseReleaseVersion(version)
  let releaseSlot = STABLE_SLOT

  if (parsed.stage) {
    releaseSlot =
      PRERELEASE_SLOTS[parsed.stage] + (parsed.prereleaseNumber ?? 0)
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch}.${releaseSlot}`
}

export function isPrereleaseVersion(version) {
  return parseReleaseVersion(version).stage !== null
}

const invokedPath = process.argv[1]
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const version = process.argv[2]
  if (!version) {
    throw new Error('Expected a release version argument.')
  }
  process.stdout.write(`${manifestVersionFor(version)}\n`)
}
