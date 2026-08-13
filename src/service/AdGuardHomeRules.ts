import ApiList from '../api/enum/ApiList'
import type { AdGuardFilteringReason } from '../api/models/AdGuardHome'
import type { DomainBlockingState } from './DomainStatusEvaluator'

export type AdGuardRuleMutation = {
  originalRules: string[]
  expectedRules: string[]
  allowRule: string
  blockRule: string
}

const normalizeRuleDomain = (input: string): string => {
  const domain = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
  if (!domain || /[\s|^$@/\\,*']/u.test(domain)) {
    throw new Error('Domain contains characters unsupported by this action')
  }
  return domain
}

export const escapeAdGuardClientName = (input: string): string => {
  const name = String(input ?? '').trim()
  if (!name) {
    throw new Error('Client name cannot be empty')
  }
  return name.replace(/[\\,'|]/gu, (character) => `\\${character}`)
}

export const createAdGuardRule = (
  list: ApiList,
  domain: string,
  clientName?: string | null,
): string => {
  const exception = list === ApiList.whitelist ? '@@' : ''
  const scope = clientName
    ? `$client='${escapeAdGuardClientName(clientName)}'`
    : ''
  return `${exception}||${normalizeRuleDomain(domain)}^${scope}`
}

export const planAdGuardRuleMutation = (
  rules: readonly string[],
  list: ApiList,
  domain: string,
  clientName?: string | null,
): AdGuardRuleMutation => {
  const allowRule = createAdGuardRule(ApiList.whitelist, domain, clientName)
  const blockRule = createAdGuardRule(ApiList.blacklist, domain, clientName)
  const target = list === ApiList.whitelist ? allowRule : blockRule
  const firstManagedIndex = rules.findIndex(
    (rule) => rule === allowRule || rule === blockRule,
  )
  const expectedRules = rules.filter(
    (rule) => rule !== allowRule && rule !== blockRule,
  )
  expectedRules.splice(
    firstManagedIndex < 0 ? expectedRules.length : firstManagedIndex,
    0,
    target,
  )

  return {
    originalRules: [...rules],
    expectedRules,
    allowRule,
    blockRule,
  }
}

const countRule = (rules: readonly string[], target: string): number =>
  rules.reduce((count, rule) => count + Number(rule === target), 0)

/**
 * Reverts only the two canonical rules owned by this action. If those rules no
 * longer match the applied state, a user or another process changed them and
 * the rollback is skipped instead of overwriting that newer decision.
 */
export const mergeAdGuardRuleRollback = (
  currentRules: readonly string[],
  mutation: AdGuardRuleMutation,
): string[] | null => {
  const managedRules = [mutation.allowRule, mutation.blockRule]
  const stillApplied = managedRules.every(
    (rule) =>
      countRule(currentRules, rule) === countRule(mutation.expectedRules, rule),
  )
  if (!stillApplied) {
    return null
  }

  const restored = currentRules.filter((rule) => !managedRules.includes(rule))
  const originalManaged = mutation.originalRules.filter((rule) =>
    managedRules.includes(rule),
  )
  if (originalManaged.length === 0) {
    return restored
  }

  const firstOriginalIndex = mutation.originalRules.findIndex((rule) =>
    managedRules.includes(rule),
  )
  restored.splice(
    Math.min(firstOriginalIndex, restored.length),
    0,
    ...originalManaged,
  )
  return restored
}

export const adGuardRulesEqual = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((rule, index) => rule === right[index])

export const evaluateAdGuardReason = (
  reason?: AdGuardFilteringReason,
): DomainBlockingState => {
  if (!reason || reason === 'NotFilteredError') {
    return 'unknown'
  }
  if (reason.startsWith('Filtered')) {
    return 'blocked'
  }
  return 'allowed'
}
