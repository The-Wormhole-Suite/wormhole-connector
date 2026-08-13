import ApiList from '../api/enum/ApiList'
import type { PiHoleGroup } from '../api/models/PiHoleGroups'
import {
  runMultiInstanceTransaction,
  type MultiInstanceTarget,
} from './MultiInstanceOperation'
import OperationCoordinator from './OperationCoordinator'
import PiHoleApiService from './PiHoleApiService'
import type { PiHoleSettingsStorage } from './StorageService'

const STORAGE_KEY = 'group_pause_actions_v2'
const LEGACY_STORAGE_KEY = 'group_pause_actions_v1'
const ALARM_PREFIX = 'pihole.groupPause.v2.'
const LEGACY_ALARM_PREFIX = 'pihole.groupPause.'
const RESTORE_RETRY_DELAY = 60 * 1000
// Kept verbatim so rules created by older versions can be identified safely.
const LEGACY_PAUSE_COMMENT = 'Client-group pause by PiHole Browser Extension'

type GroupPauseTarget = {
  pi_uri_base: string
  original: PiHoleGroup
  expected: PiHoleGroup
}

type GroupPauseAction = {
  groupName: string
  expiresAt: number | null
  targets: GroupPauseTarget[]
}

type GroupPauseStorage = {
  actions: Record<string, GroupPauseAction>
}

type LegacyPauseAction = {
  pattern: string
  targets: Array<{ pi_uri_base: string }>
}

type LegacyPauseStorage = {
  actions?: Record<string, LegacyPauseAction>
}

export type GroupBlockingState = 'active' | 'paused' | 'mixed'

export default class GroupPauseService {
  public static async initialize(): Promise<void> {
    await this.cleanupLegacyPauseActions()

    const storage = await this.getStorage()
    const now = Date.now()
    for (const [key, action] of Object.entries(storage.actions)) {
      if (action.expiresAt === null) {
        continue
      }

      if (action.expiresAt <= now) {
        await this.restoreAction(key)
      } else {
        await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
      }
    }
  }

  public static async handleAlarm(alarmName: string): Promise<boolean> {
    if (alarmName.startsWith(ALARM_PREFIX)) {
      await this.restoreAction(alarmName.slice(ALARM_PREFIX.length))
      return true
    }
    if (alarmName.startsWith(LEGACY_ALARM_PREFIX)) {
      await this.cleanupLegacyPauseActions()
      return true
    }

    return false
  }

  public static async getGroupState(
    groupName: string,
  ): Promise<GroupBlockingState> {
    if (!groupName) {
      throw new Error('Group name cannot be empty')
    }

    const piHoles = await PiHoleApiService.getConfiguredPiHoles()
    const states = await Promise.all(
      piHoles.map(async (piHole) => {
        const group = await PiHoleApiService.getGroup(piHole, groupName)
        if (!group) {
          throw new Error(
            `Group ${groupName} is missing on ${piHole.pi_uri_base}`,
          )
        }
        return group.enabled
      }),
    )

    if (states.every(Boolean)) {
      return 'active'
    }
    if (states.every((state) => !state)) {
      return 'paused'
    }
    return 'mixed'
  }

  public static async isGroupPaused(groupName: string): Promise<boolean> {
    return (await this.getGroupState(groupName)) === 'paused'
  }

  public static async pauseGroup(
    groupName: string,
    durationSeconds: number,
  ): Promise<boolean> {
    this.assertDuration(durationSeconds)
    if (!groupName) {
      throw new Error('Group name cannot be empty')
    }

    return OperationCoordinator.runExclusive(
      [STORAGE_KEY, `group:${groupName}`],
      () => this.pauseGroupLocked(groupName, durationSeconds),
    )
  }

  public static async resumeGroup(groupName: string): Promise<void> {
    if (!groupName) {
      throw new Error('Group name cannot be empty')
    }

    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `group:${groupName}`],
      () => this.resumeGroupLocked(groupName),
    )
  }

  private static async pauseGroupLocked(
    groupName: string,
    durationSeconds: number,
  ): Promise<boolean> {
    const key = encodeURIComponent(groupName)
    let storage = await this.getStorage()
    const existingAction = storage.actions[key]

    if (existingAction && (await this.actionStillApplied(existingAction))) {
      existingAction.expiresAt = this.getExpiry(durationSeconds)
      await this.saveStorage(storage)
      await this.scheduleAction(key, existingAction.expiresAt)
      return true
    }

    if (existingAction) {
      await this.restoreActionLocked(key)
      storage = await this.getStorage()
    }

    const action: GroupPauseAction = {
      groupName,
      expiresAt: this.getExpiry(durationSeconds),
      targets: [],
    }

    try {
      const piHoles = await PiHoleApiService.getConfiguredPiHoles()
      const prepared = await Promise.all(
        piHoles.map(async (piHole) => {
          const current = await PiHoleApiService.getGroup(piHole, groupName)
          if (!current) {
            throw new Error(
              `Group ${groupName} is missing on ${piHole.pi_uri_base}`,
            )
          }
          return { piHole, current }
        }),
      )

      for (const { piHole, current } of prepared) {
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
        storage.actions[key] = action
        await this.saveStorage(storage)
      }

      if (action.targets.length === 0) {
        return true
      }

      storage.actions[key] = action
      await this.saveStorage(storage)
      await this.scheduleAction(key, action.expiresAt)
      return true
    } catch (reason) {
      const failedTargets = await this.restoreTargets(action)
      storage = await this.getStorage()

      if (failedTargets.length > 0) {
        action.targets = failedTargets
        action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
        storage.actions[key] = action
        await this.saveStorage(storage)
        await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
      } else {
        delete storage.actions[key]
        await this.saveStorage(storage)
      }

      throw reason
    }
  }

  private static async resumeGroupLocked(groupName: string): Promise<void> {
    const key = encodeURIComponent(groupName)
    const storage = await this.getStorage()
    const action = storage.actions[key]

    if (action) {
      const failedTargets = await this.restoreTargets(action)
      if (failedTargets.length > 0) {
        action.targets = failedTargets
        action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
        storage.actions[key] = action
        await this.saveStorage(storage)
        await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
        throw new Error(`Failed to resume group ${groupName}`)
      }

      delete storage.actions[key]
      await this.saveStorage(storage)
      await this.clearAlarm(`${ALARM_PREFIX}${key}`)
    }

    const piHoles = await PiHoleApiService.getConfiguredPiHoles()
    await runMultiInstanceTransaction(
      this.toTargets(piHoles),
      async (piHole) => {
        const current = await PiHoleApiService.getGroup(piHole, groupName)
        if (!current) {
          throw new Error(`Group ${groupName} is missing`)
        }
        return this.cloneGroup(current)
      },
      async (piHole, current) => {
        if (!current.enabled) {
          await PiHoleApiService.replaceGroup(piHole, groupName, {
            name: current.name,
            comment: current.comment,
            enabled: true,
          })
        }
      },
      async (piHole, original) => {
        await PiHoleApiService.replaceGroup(piHole, groupName, {
          name: original.name,
          comment: original.comment,
          enabled: original.enabled,
        })
      },
    )
  }

  private static async actionStillApplied(
    action: GroupPauseAction,
  ): Promise<boolean> {
    const piHoles = await PiHoleApiService.getConfiguredPiHoles()
    for (const target of action.targets) {
      const piHole = this.findPiHole(piHoles, target.pi_uri_base)
      if (!piHole) {
        return false
      }

      const current = await PiHoleApiService.getGroup(piHole, action.groupName)
      if (!current || !this.groupsEqual(current, target.expected)) {
        return false
      }
    }
    return true
  }

  private static async restoreAction(key: string): Promise<void> {
    const initialStorage = await this.getStorage()
    const action = initialStorage.actions[key]
    if (!action) {
      return
    }

    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `group:${action.groupName}`],
      () => this.restoreActionLocked(key),
    )
  }

  private static async restoreActionLocked(key: string): Promise<void> {
    const storage = await this.getStorage()
    const action = storage.actions[key]
    if (!action) {
      return
    }

    const failedTargets = await this.restoreTargets(action)
    if (failedTargets.length > 0) {
      action.targets = failedTargets
      action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
      storage.actions[key] = action
      await this.saveStorage(storage)
      await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
      return
    }

    delete storage.actions[key]
    await this.saveStorage(storage)
    await this.clearAlarm(`${ALARM_PREFIX}${key}`)
  }

  private static async restoreTargets(
    action: GroupPauseAction,
  ): Promise<GroupPauseTarget[]> {
    const piHoles = await PiHoleApiService.getConfiguredPiHoles().catch(
      () => [],
    )
    const failedTargets: GroupPauseTarget[] = []

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
        console.warn('Failed to restore client group', reason)
        failedTargets.push(target)
      }
    }

    return failedTargets
  }

  private static async cleanupLegacyPauseActions(): Promise<void> {
    await OperationCoordinator.runExclusive(LEGACY_STORAGE_KEY, async () => {
      const legacyStorage = await this.getLegacyStorage()
      const actions = legacyStorage.actions || {}
      if (Object.keys(actions).length === 0) {
        return
      }

      const piHoles = await PiHoleApiService.getConfiguredPiHoles().catch(
        () => [],
      )
      const remainingActions: Record<string, LegacyPauseAction> = {}

      for (const [key, action] of Object.entries(actions)) {
        const failedTargets: LegacyPauseAction['targets'] = []
        for (const target of action.targets || []) {
          const piHole = this.findPiHole(piHoles, target.pi_uri_base)
          if (!piHole) {
            failedTargets.push(target)
            continue
          }

          try {
            const current = await PiHoleApiService.getRegexDomain(
              piHole,
              ApiList.whitelist,
              action.pattern,
            )
            if (current?.comment === LEGACY_PAUSE_COMMENT) {
              await PiHoleApiService.deleteRegexDomain(
                piHole,
                ApiList.whitelist,
                action.pattern,
              )
            }
          } catch (reason) {
            console.warn('Failed to remove a legacy group pause rule', reason)
            failedTargets.push(target)
          }
        }

        if (failedTargets.length > 0) {
          remainingActions[key] = { ...action, targets: failedTargets }
          await this.createAlarm(
            `${LEGACY_ALARM_PREFIX}${key}`,
            Date.now() + RESTORE_RETRY_DELAY,
          )
        } else {
          await this.clearAlarm(`${LEGACY_ALARM_PREFIX}${key}`)
        }
      }

      if (Object.keys(remainingActions).length === 0) {
        await chrome.storage.local.remove(LEGACY_STORAGE_KEY)
      } else {
        await chrome.storage.local.set({
          [LEGACY_STORAGE_KEY]: { actions: remainingActions },
        })
      }
    })
  }

  private static getExpiry(durationSeconds: number): number | null {
    return durationSeconds === 0 ? null : Date.now() + durationSeconds * 1000
  }

  private static async scheduleAction(
    key: string,
    expiresAt: number | null,
  ): Promise<void> {
    await this.clearAlarm(`${ALARM_PREFIX}${key}`)
    if (expiresAt !== null) {
      await this.createAlarm(`${ALARM_PREFIX}${key}`, expiresAt)
    }
  }

  private static findPiHole(
    piHoles: PiHoleSettingsStorage[],
    baseUrl: string,
  ): PiHoleSettingsStorage | undefined {
    return piHoles.find((piHole) => piHole.pi_uri_base === baseUrl)
  }

  private static groupsEqual(left: PiHoleGroup, right: PiHoleGroup): boolean {
    return (
      left.name === right.name &&
      left.comment === right.comment &&
      left.enabled === right.enabled
    )
  }

  private static cloneGroup(group: PiHoleGroup): PiHoleGroup {
    return { ...group }
  }

  private static assertDuration(durationSeconds: number): void {
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
      throw new Error('Duration must be zero or a positive number of seconds')
    }
  }

  private static toTargets(
    piHoles: PiHoleSettingsStorage[],
  ): MultiInstanceTarget<PiHoleSettingsStorage>[] {
    return piHoles.map((piHole) => ({
      address: piHole.pi_uri_base!,
      value: piHole,
    }))
  }

  private static async getStorage(): Promise<GroupPauseStorage> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (values) => {
        resolve(
          (values[STORAGE_KEY] as GroupPauseStorage | undefined) || {
            actions: {},
          },
        )
      })
    })
  }

  private static async getLegacyStorage(): Promise<LegacyPauseStorage> {
    return new Promise((resolve) => {
      chrome.storage.local.get(LEGACY_STORAGE_KEY, (values) => {
        resolve((values[LEGACY_STORAGE_KEY] as LegacyPauseStorage) || {})
      })
    })
  }

  private static async saveStorage(storage: GroupPauseStorage): Promise<void> {
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
