import type { PiHoleVersionsV6 } from '../api/models/PiHoleVersions'

type ParsedVersion = {
  numbers: number[]
  prerelease: string[]
}

export const compareVersions = (left: string, right: string): number => {
  const leftVersion = parseVersion(left)
  const rightVersion = parseVersion(right)
  const length = Math.max(
    leftVersion.numbers.length,
    rightVersion.numbers.length,
  )

  for (let index = 0; index < length; index += 1) {
    const difference =
      (leftVersion.numbers[index] ?? 0) - (rightVersion.numbers[index] ?? 0)
    if (difference !== 0) {
      return Math.sign(difference)
    }
  }

  if (leftVersion.prerelease.length === 0) {
    return rightVersion.prerelease.length === 0 ? 0 : 1
  }
  if (rightVersion.prerelease.length === 0) {
    return -1
  }

  const prereleaseLength = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  )
  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftPart = leftVersion.prerelease[index]
    const rightPart = rightVersion.prerelease[index]
    if (typeof leftPart === 'undefined') {
      return -1
    }
    if (typeof rightPart === 'undefined') {
      return 1
    }
    if (leftPart === rightPart) {
      continue
    }

    const leftNumber = Number(leftPart)
    const rightNumber = Number(rightPart)
    const leftIsNumber = Number.isInteger(leftNumber)
    const rightIsNumber = Number.isInteger(rightNumber)
    if (leftIsNumber && rightIsNumber) {
      return Math.sign(leftNumber - rightNumber)
    }
    if (leftIsNumber !== rightIsNumber) {
      return leftIsNumber ? -1 : 1
    }
    return leftPart.localeCompare(rightPart)
  }

  return 0
}

export const hasPiHoleUpdate = (data: PiHoleVersionsV6): boolean =>
  [data.version.core, data.version.web, data.version.ftl].some(
    (component) =>
      Boolean(component.remote?.version) &&
      compareVersions(component.local.version, component.remote.version) < 0,
  )

const parseVersion = (input: string): ParsedVersion => {
  const value = String(input ?? '')
    .trim()
    .replace(/^v/i, '')
  const match =
    /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (!match) {
    throw new Error(`Invalid version: ${input}`)
  }

  return {
    numbers: match[1].split('.').map(Number),
    prerelease: match[2]?.split('.') ?? [],
  }
}
