import ApiList from '../api/enum/ApiList'
import { PiHoleDomain } from '../api/models/PiHoleDomains'
import { PiHoleGroup } from '../api/models/PiHoleGroups'
import PiHoleApiService from './PiHoleApiService'
import OperationCoordinator from './OperationCoordinator'
import { PiHoleSettingsStorage } from './StorageService'

const STORAGE_KEY = 'temporary_actions_v1'
const DOMAIN_ALARM_PREFIX = 'pihole.temporaryAllow.'
const GROUP_ALARM_PREFIX = 'pihole.temporaryGroup.'
const RESTORE_RETRY_DELAY = 60 * 1000
const TEMPORARY_ALLOW_COMMENT = 'Temporary allow by Wormhole Connector'
const TEMPORARY_GROUP_ALLOW_COMMENT =
  'Temporary group allow by Wormhole Connector'

type TemporaryDomainTarget = {
  pi_uri_base: string
  original: PiHoleDomain | null
  expected: PiHoleDomain
}

type TemporaryGroupTarget = {
  pi_uri_base: string
  original: PiHoleGroup
  expected: PiHoleGroup
}

type TemporaryDomainAction = {
  domain: string
  ruleDomain?: string
  kind?: 'exact' | 'regex'
  expiresAt: number
  targets: TemporaryDomainTarget[]
}

type TemporaryGroupAction = {
  groupName: string
  expiresAt: number
  targets: TemporaryGroupTarget[]
}

type TemporaryActionsStorage = {
  domains: Record<string, TemporaryDomainAction>
  groups: Record<string, TemporaryGroupAction>
}

export default class TemporaryActionService {
  public static async initialize(): Promise<void> {
    await OperationCoordinator.runExclusive(STORAGE_KEY, () =>
      this.initializeUnlocked(),
    )
  }

  private static async initializeUnlocked(): Promise<void> {
    const storage = await this.getStorage()
    const now = Date.now()

    for (const [key, action] of Object.entries(storage.domains)) {
      if (action.expiresAt <= now) {
        await this.restoreDomainAction(key)
      } else {
        await this.createAlarm(`${DOMAIN_ALARM_PREFIX}${key}`, action.expiresAt)
      }
    }

    for (const [key, action] of Object.entries(storage.groups)) {
      if (action.expiresAt <= now) {
        await this.restoreGroupAction(key)
      } else {
        await this.createAlarm(`${GROUP_ALARM_PREFIX}${key}`, action.expiresAt)
      }
    }
  }

  public static async handleAlarm(alarmName: string): Promise<boolean> {
    return OperationCoordinator.runExclusive(STORAGE_KEY, () =>
      this.handleAlarmUnlocked(alarmName),
    )
  }

  private static async handleAlarmUnlocked(
    alarmName: string,
  ): Promise<boolean> {
    if (alarmName.startsWith(DOMAIN_ALARM_PREFIX)) {
      await this.restoreDomainAction(
        alarmName.slice(DOMAIN_ALARM_PREFIX.length),
      )
      return true
    }

    if (alarmName.startsWith(GROUP_ALARM_PREFIX)) {
      await this.restoreGroupAction(alarmName.slice(GROUP_ALARM_PREFIX.length))
      return true
    }

    return false
  }

  public static async temporarilyAllowDomain(
    domain: string,
    durationSeconds: number,
  ): Promise<boolean> {
    return OperationCoordinator.runExclusive(STORAGE_KEY, () =>
      this.temporarilyAllowDomainUnlocked(domain, durationSeconds),
    )
  }

  private static async temporarilyAllowDomainUnlocked(
    domain: string,
    durationSeconds: number,
  ): Promise<boolean> {
    this.assertDuration(durationSeconds)
    if (!domain) {
      throw new Error("Domain can't be empty")
    }

    const key = encodeURIComponent(domain)
    let storage = await this.getStorage()
    const existingAction = storage.domains[key]

    if (existingAction && existingAction.expiresAt > Date.now()) {
      existingAction.expiresAt = Date.now() + durationSeconds * 1000
      await this.saveStorage(storage)
      await this.createAlarm(
        `${DOMAIN_ALARM_PREFIX}${key}`,
        existingAction.expiresAt,
      )
      return true
    }

    if (existingAction) {
      await this.restoreDomainAction(key)
      storage = await this.getStorage()
    }

    const action: TemporaryDomainAction = {
      domain,
      expiresAt: Date.now() + durationSeconds * 1000,
      targets: [],
    }

    try {
      const piHoles = await PiHoleApiService.getConfiguredPiHoles()
      const snapshots = await Promise.all(
        piHoles.map(async (piHole) => ({
          piHole,
          current: await PiHoleApiService.getExactDomain(
            piHole,
            ApiList.whitelist,
            domain,
          ),
        })),
      )

      for (const { piHole, current } of snapshots) {
        if (current?.enabled && current.groups.includes(0)) {
          continue
        }

        const payload = {
          comment: current?.comment ?? TEMPORARY_ALLOW_COMMENT,
          groups: current ? Array.from(new Set([...current.groups, 0])) : [0],
          enabled: true,
        }

        const expected = current
          ? await PiHoleApiService.replaceExactDomain(
              piHole,
              ApiList.whitelist,
              domain,
              payload,
            )
          : await PiHoleApiService.addExactDomain(
              piHole,
              ApiList.whitelist,
              domain,
              payload,
            )

        action.targets.push({
          pi_uri_base: piHole.pi_uri_base!,
          original: current ? this.cloneDomain(current) : null,
          expected: this.cloneDomain(expected),
        })

        storage.domains[key] = action
        // Persist after each successful Pi-hole mutation so a service-worker
        // shutdown cannot leave an untracked temporary allow entry behind.
        await this.saveStorage(storage)
      }

      if (action.targets.length < 1) {
        return false
      }

      storage.domains[key] = action
      await this.saveStorage(storage)
      await this.createAlarm(`${DOMAIN_ALARM_PREFIX}${key}`, action.expiresAt)
      return true
    } catch (reason) {
      const failedTargets = await this.restoreDomainTargets(action)
      storage = await this.getStorage()

      if (failedTargets.length > 0) {
        action.targets = failedTargets
        action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
        storage.domains[key] = action
        await this.saveStorage(storage)
        await this.createAlarm(`${DOMAIN_ALARM_PREFIX}${key}`, action.expiresAt)
      } else {
        delete storage.domains[key]
        await this.saveStorage(storage)
      }

      throw reason
    }
  }

  public static async temporarilyAllowDomainForGroup(
    domain: string,
    groupName: string,
    durationSeconds: number,
  ): Promise<boolean> {
    return OperationCoordinator.runExclusive(STORAGE_KEY, () =>
      this.temporarilyAllowDomainForGroupUnlocked(
        domain,
        groupName,
        durationSeconds,
      ),
    )
  }

  private static async temporarilyAllowDomainForGroupUnlocked(
    domain: string,
    groupName: string,
    durationSeconds: number,
  ): Promise<boolean> {
    this.assertDuration(durationSeconds)
    if (!domain) {
      throw new Error("Domain can't be empty")
    }
    if (!groupName) {
      throw new Error('Group name cannot be empty')
    }

    const key = this.createGroupDomainActionKey(domain, groupName)
    let storage = await this.getStorage()
    const existingAction = storage.domains[key]

    if (existingAction && existingAction.expiresAt > Date.now()) {
      existingAction.expiresAt = Date.now() + durationSeconds * 1000
      await this.saveStorage(storage)
      await this.createAlarm(
        `${DOMAIN_ALARM_PREFIX}${key}`,
        existingAction.expiresAt,
      )
      return true
    }

    if (existingAction) {
      await this.restoreDomainAction(key)
      storage = await this.getStorage()
    }

    const ruleDomain = this.createScopedDomainPattern(domain, groupName)
    const action: TemporaryDomainAction = {
      domain,
      ruleDomain,
      kind: 'regex',
      expiresAt: Date.now() + durationSeconds * 1000,
      targets: [],
    }

    try {
      const piHoles = await PiHoleApiService.getConfiguredPiHoles()
      const snapshots = await Promise.all(
        piHoles.map(async (piHole) => ({
          piHole,
          group: await PiHoleApiService.getGroup(piHole, groupName),
          current: await PiHoleApiService.getRegexDomain(
            piHole,
            ApiList.whitelist,
            ruleDomain,
          ),
        })),
      )

      for (const { piHole, group, current } of snapshots) {
        if (!group) {
          throw new Error(`Group ${groupName} is missing on one Pi-hole`)
        }
        if (current && current.comment !== TEMPORARY_GROUP_ALLOW_COMMENT) {
          throw new Error(
            `The reserved temporary allow rule for ${groupName} already exists`,
          )
        }

        const payload = {
          comment: TEMPORARY_GROUP_ALLOW_COMMENT,
          groups: [group.id],
          enabled: true,
        }
        const expected = current
          ? await PiHoleApiService.replaceRegexDomain(
              piHole,
              ApiList.whitelist,
              ruleDomain,
              payload,
            )
          : await PiHoleApiService.addRegexDomain(
              piHole,
              ApiList.whitelist,
              ruleDomain,
              payload,
            )

        action.targets.push({
          pi_uri_base: piHole.pi_uri_base!,
          original: null,
          expected: this.cloneDomain(expected),
        })
        storage.domains[key] = action
        await this.saveStorage(storage)
      }

      if (action.targets.length < 1) {
        return false
      }

      storage.domains[key] = action
      await this.saveStorage(storage)
      await this.createAlarm(`${DOMAIN_ALARM_PREFIX}${key}`, action.expiresAt)
      return true
    } catch (reason) {
      const failedTargets = await this.restoreDomainTargets(action)
      storage = await this.getStorage()

      if (failedTargets.length > 0) {
        action.targets = failedTargets
        action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
        storage.domains[key] = action
        await this.saveStorage(storage)
        await this.createAlarm(`${DOMAIN_ALARM_PREFIX}${key}`, action.expiresAt)
      } else {
        delete storage.domains[key]
        await this.saveStorage(storage)
      }

      throw reason
    }
  }

  public static async temporarilyDisableGroup(
    groupName: string,
    durationSeconds: number,
  ): Promise<boolean> {
    return OperationCoordinator.runExclusive(STORAGE_KEY, () =>
      this.temporarilyDisableGroupUnlocked(groupName, durationSeconds),
    )
  }

  private static async temporarilyDisableGroupUnlocked(
    groupName: string,
    durationSeconds: number,
  ): Promise<boolean> {
    this.assertDuration(durationSeconds)
    if (!groupName) {
      throw new Error('Group name cannot be empty')
    }

    const key = encodeURIComponent(groupName)
    let storage = await this.getStorage()
    const existingAction = storage.groups[key]

    if (existingAction && existingAction.expiresAt > Date.now()) {
      existingAction.expiresAt = Date.now() + durationSeconds * 1000
      await this.saveStorage(storage)
      await this.createAlarm(
        `${GROUP_ALARM_PREFIX}${key}`,
        existingAction.expiresAt,
      )
      return true
    }

    if (existingAction) {
      await this.restoreGroupAction(key)
      storage = await this.getStorage()
    }

    const action: TemporaryGroupAction = {
      groupName,
      expiresAt: Date.now() + durationSeconds * 1000,
      targets: [],
    }

    try {
      const piHoles = await PiHoleApiService.getConfiguredPiHoles()
      const snapshots = await Promise.all(
        piHoles.map(async (piHole) => ({
          piHole,
          current: await PiHoleApiService.getGroup(piHole, groupName),
        })),
      )

      for (const { piHole, current } of snapshots) {
        if (!current) {
          throw new Error(`Group ${groupName} is missing on one Pi-hole`)
        }
        if (!current.enabled) {
          continue
        }

        const expected = await PiHoleApiService.replaceGroup(
          piHole,
          groupName,
          {
            name: current.name,
            comment: current.comment,
            enabled: false,
          },
        )

        action.targets.push({
          pi_uri_base: piHole.pi_uri_base!,
          original: this.cloneGroup(current),
          expected: this.cloneGroup(expected),
        })

        storage.groups[key] = action
        await this.saveStorage(storage)
      }

      if (action.targets.length < 1) {
        return false
      }

      storage.groups[key] = action
      await this.saveStorage(storage)
      await this.createAlarm(`${GROUP_ALARM_PREFIX}${key}`, action.expiresAt)
      return true
    } catch (reason) {
      const failedTargets = await this.restoreGroupTargets(action)
      storage = await this.getStorage()

      if (failedTargets.length > 0) {
        action.targets = failedTargets
        action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
        storage.groups[key] = action
        await this.saveStorage(storage)
        await this.createAlarm(`${GROUP_ALARM_PREFIX}${key}`, action.expiresAt)
      } else {
        delete storage.groups[key]
        await this.saveStorage(storage)
      }

      throw reason
    }
  }

  public static async cancelTemporaryGroupAction(
    groupName: string,
  ): Promise<void> {
    await OperationCoordinator.runExclusive(STORAGE_KEY, () =>
      this.cancelTemporaryGroupActionUnlocked(groupName),
    )
  }

  private static async cancelTemporaryGroupActionUnlocked(
    groupName: string,
  ): Promise<void> {
    const key = encodeURIComponent(groupName)
    const storage = await this.getStorage()

    if (!storage.groups[key]) {
      return
    }

    delete storage.groups[key]
    await this.saveStorage(storage)
    await this.clearAlarm(`${GROUP_ALARM_PREFIX}${key}`)
  }

  private static async restoreDomainAction(key: string): Promise<void> {
    const storage = await this.getStorage()
    const action = storage.domains[key]
    if (!action) {
      return
    }

    const failedTargets = await this.restoreDomainTargets(action)
    if (failedTargets.length > 0) {
      action.targets = failedTargets
      action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
      storage.domains[key] = action
      await this.saveStorage(storage)
      await this.createAlarm(`${DOMAIN_ALARM_PREFIX}${key}`, action.expiresAt)
      return
    }

    delete storage.domains[key]
    await this.saveStorage(storage)
    await this.clearAlarm(`${DOMAIN_ALARM_PREFIX}${key}`)
  }

  private static async restoreGroupAction(key: string): Promise<void> {
    const storage = await this.getStorage()
    const action = storage.groups[key]
    if (!action) {
      return
    }

    const failedTargets = await this.restoreGroupTargets(action)
    if (failedTargets.length > 0) {
      action.targets = failedTargets
      action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
      storage.groups[key] = action
      await this.saveStorage(storage)
      await this.createAlarm(`${GROUP_ALARM_PREFIX}${key}`, action.expiresAt)
      return
    }

    delete storage.groups[key]
    await this.saveStorage(storage)
    await this.clearAlarm(`${GROUP_ALARM_PREFIX}${key}`)
  }

  private static async restoreDomainTargets(
    action: TemporaryDomainAction,
  ): Promise<TemporaryDomainTarget[]> {
    const piHoles = await PiHoleApiService.getConfiguredPiHoles().catch(
      () => [],
    )
    const failedTargets: TemporaryDomainTarget[] = []

    for (const target of action.targets) {
      const piHole = this.findPiHole(piHoles, target.pi_uri_base)
      if (!piHole) {
        failedTargets.push(target)
        continue
      }

      try {
        const ruleDomain = action.ruleDomain ?? action.domain
        const isRegex = action.kind === 'regex'
        const current = isRegex
          ? await PiHoleApiService.getRegexDomain(
              piHole,
              ApiList.whitelist,
              ruleDomain,
            )
          : await PiHoleApiService.getExactDomain(
              piHole,
              ApiList.whitelist,
              ruleDomain,
            )

        // A user changed or removed the entry while the timer was running.
        // In that case their newer state wins and we do not overwrite it.
        if (!current || !this.domainsEqual(current, target.expected)) {
          continue
        }

        if (target.original) {
          const payload = {
            comment: target.original.comment,
            groups: target.original.groups,
            enabled: target.original.enabled,
          }
          if (isRegex) {
            await PiHoleApiService.replaceRegexDomain(
              piHole,
              ApiList.whitelist,
              ruleDomain,
              payload,
            )
          } else {
            await PiHoleApiService.replaceExactDomain(
              piHole,
              ApiList.whitelist,
              ruleDomain,
              payload,
            )
          }
        } else if (isRegex) {
          await PiHoleApiService.deleteRegexDomain(
            piHole,
            ApiList.whitelist,
            ruleDomain,
          )
        } else {
          await PiHoleApiService.deleteExactDomain(
            piHole,
            ApiList.whitelist,
            ruleDomain,
          )
        }
      } catch (reason) {
        console.warn('Failed to restore temporary domain allow', reason)
        failedTargets.push(target)
      }
    }

    return failedTargets
  }

  private static async restoreGroupTargets(
    action: TemporaryGroupAction,
  ): Promise<TemporaryGroupTarget[]> {
    const piHoles = await PiHoleApiService.getConfiguredPiHoles().catch(
      () => [],
    )
    const failedTargets: TemporaryGroupTarget[] = []

    for (const target of action.targets) {
      const piHole = this.findPiHole(piHoles, target.pi_uri_base)
      if (!piHole) {
        failedTargets.push(target)
        continue
      }

      try {
        const current = await PiHoleApiService.getGroup(
          piHole,
          action.groupName,
        )

        if (!current || !this.groupsEqual(current, target.expected)) {
          continue
        }

        await PiHoleApiService.replaceGroup(piHole, action.groupName, {
          name: target.original.name,
          comment: target.original.comment,
          enabled: target.original.enabled,
        })
      } catch (reason) {
        console.warn('Failed to restore temporary group state', reason)
        failedTargets.push(target)
      }
    }

    return failedTargets
  }

  private static createGroupDomainActionKey(
    domain: string,
    groupName: string,
  ): string {
    return encodeURIComponent(`${domain}::${groupName}`)
  }

  private static createScopedDomainPattern(
    domain: string,
    groupName: string,
  ): string {
    const escapedDomain = domain.replace(
      /[.*+?^${}()|[\]\\]/g,
      (match) => `\\${match}`,
    )
    const suffix = Array.from(`${domain}:${groupName}`)
      .map((character) => character.codePointAt(0)!.toString(16))
      .join('_')
    return `^${escapedDomain}$|^__pihole_browser_extension_domain_${suffix}__$`
  }

  private static findPiHole(
    piHoles: PiHoleSettingsStorage[],
    baseUrl: string,
  ): PiHoleSettingsStorage | undefined {
    return piHoles.find((piHole) => piHole.pi_uri_base === baseUrl)
  }

  private static domainsEqual(
    left: PiHoleDomain,
    right: PiHoleDomain,
  ): boolean {
    return (
      left.domain === right.domain &&
      left.type === right.type &&
      left.kind === right.kind &&
      left.comment === right.comment &&
      left.enabled === right.enabled &&
      this.numberArraysEqual(left.groups, right.groups)
    )
  }

  private static groupsEqual(left: PiHoleGroup, right: PiHoleGroup): boolean {
    return (
      left.name === right.name &&
      left.comment === right.comment &&
      left.enabled === right.enabled
    )
  }

  private static numberArraysEqual(left: number[], right: number[]): boolean {
    if (left.length !== right.length) {
      return false
    }
    const leftSorted = [...left].sort((a, b) => a - b)
    const rightSorted = [...right].sort((a, b) => a - b)
    return leftSorted.every((value, index) => value === rightSorted[index])
  }

  private static cloneDomain(domain: PiHoleDomain): PiHoleDomain {
    return { ...domain, groups: [...domain.groups] }
  }

  private static cloneGroup(group: PiHoleGroup): PiHoleGroup {
    return { ...group }
  }

  private static assertDuration(durationSeconds: number): void {
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
      throw new Error('Duration must be a positive number of seconds')
    }
  }

  private static async getStorage(): Promise<TemporaryActionsStorage> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (values) => {
        resolve(
          (values[STORAGE_KEY] as TemporaryActionsStorage | undefined) || {
            domains: {},
            groups: {},
          },
        )
      })
    })
  }

  private static async saveStorage(
    storage: TemporaryActionsStorage,
  ): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: storage })
  }

  private static async createAlarm(name: string, when: number): Promise<void> {
    if (typeof browser !== 'undefined') {
      browser.alarms.create(name, { when })
      return
    }
    await chrome.alarms.create(name, { when })
  }

  private static async clearAlarm(name: string): Promise<void> {
    if (typeof browser !== 'undefined') {
      await browser.alarms.clear(name)
      return
    }
    await chrome.alarms.clear(name)
  }
}
