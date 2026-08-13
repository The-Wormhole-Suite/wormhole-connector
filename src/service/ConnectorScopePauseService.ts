import ConnectorApiService, {
  type ConnectorScopeMutation,
} from './ConnectorApiService'
import { getConnectorIdentity } from './ConnectorUrl'
import OperationCoordinator from './OperationCoordinator'
import type { ConnectorSettingsStorage } from './StorageService'

const STORAGE_KEY = 'wormhole_scope_pause_actions_v1'
const ALARM_PREFIX = 'wormhole.scopePause.v1.'
const RESTORE_RETRY_DELAY = 60 * 1000

type ScopePauseTarget = {
  connectorIdentity: string
  mutation: ConnectorScopeMutation
}

type ScopePauseAction = {
  scopeName: string
  expiresAt: number | null
  targets: ScopePauseTarget[]
}

type ScopePauseStorage = {
  actions: Record<string, ScopePauseAction>
}

export default class ConnectorScopePauseService {
  public static async initialize(): Promise<void> {
    const storage = await this.getStorage()
    for (const [key, action] of Object.entries(storage.actions)) {
      if (action.expiresAt === null) {
        continue
      }
      if (action.expiresAt <= Date.now()) {
        await this.restoreAction(key)
      } else {
        await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
      }
    }
  }

  public static async handleAlarm(alarmName: string): Promise<boolean> {
    if (!alarmName.startsWith(ALARM_PREFIX)) {
      return false
    }
    await this.restoreAction(alarmName.slice(ALARM_PREFIX.length))
    return true
  }

  public static getScopeState(
    scopeName: string,
  ): Promise<'active' | 'paused' | 'mixed'> {
    return ConnectorApiService.getScopeState(scopeName)
  }

  public static async pauseScope(
    scopeName: string,
    durationSeconds: number,
  ): Promise<void> {
    if (!scopeName) {
      throw new Error('Scope name cannot be empty')
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
      throw new Error('Pause duration must be a non-negative integer')
    }
    const key = encodeURIComponent(scopeName)
    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `scope:${scopeName}`],
      () => this.pauseScopeLocked(key, scopeName, durationSeconds),
    )
  }

  public static async resumeScope(scopeName: string): Promise<void> {
    if (!scopeName) {
      throw new Error('Scope name cannot be empty')
    }
    const key = encodeURIComponent(scopeName)
    const restoredStoredAction = await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `scope:${scopeName}`],
      async () => {
        const storage = await this.getStorage()
        if (!storage.actions[key]) {
          return false
        }
        const failed = await this.restoreTargets(storage.actions[key])
        if (failed.length > 0) {
          storage.actions[key].targets = failed
          storage.actions[key].expiresAt = Date.now() + RESTORE_RETRY_DELAY
          await this.saveStorage(storage)
          await this.createAlarm(
            `${ALARM_PREFIX}${key}`,
            storage.actions[key].expiresAt,
          )
          throw new Error(`Failed to resume scope ${scopeName}`)
        }
        delete storage.actions[key]
        await this.saveStorage(storage)
        await this.clearAlarm(`${ALARM_PREFIX}${key}`)
        return true
      },
    )
    if (!restoredStoredAction) {
      await ConnectorApiService.setScopeState(scopeName, true)
    }
  }

  private static async pauseScopeLocked(
    key: string,
    scopeName: string,
    durationSeconds: number,
  ): Promise<void> {
    let storage = await this.getStorage()
    if (storage.actions[key]) {
      await this.restoreActionLocked(key)
      storage = await this.getStorage()
      if (storage.actions[key]) {
        throw new Error('The previous scope pause is still recovering')
      }
    }
    const connectors = await ConnectorApiService.getConfiguredConnectors()
    const prepared = await Promise.all(
      connectors.map(async (connector) => ({
        connector,
        mutation: await ConnectorApiService.prepareScopeMutation(
          connector,
          scopeName,
          false,
        ),
      })),
    )
    const action: ScopePauseAction = {
      scopeName,
      expiresAt:
        durationSeconds === 0 ? null : Date.now() + durationSeconds * 1000,
      targets: [],
    }
    try {
      for (const item of prepared) {
        action.targets.push({
          connectorIdentity: getConnectorIdentity(item.connector),
          mutation: item.mutation,
        })
        storage.actions[key] = action
        await this.saveStorage(storage)
        await ConnectorApiService.applyScopeMutation(
          item.connector,
          item.mutation,
        )
      }
      if (action.expiresAt !== null) {
        await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
      }
    } catch (reason) {
      const failed = await this.restoreTargets(action, false)
      storage = await this.getStorage()
      if (failed.length > 0) {
        action.targets = failed
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

  private static async restoreAction(key: string): Promise<void> {
    const storage = await this.getStorage()
    const action = storage.actions[key]
    if (!action) {
      return
    }
    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `scope:${action.scopeName}`],
      () => this.restoreActionLocked(key),
    )
  }

  private static async restoreActionLocked(key: string): Promise<void> {
    const storage = await this.getStorage()
    const action = storage.actions[key]
    if (!action) {
      return
    }
    const failed = await this.restoreTargets(action)
    if (failed.length > 0) {
      action.targets = failed
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
    action: ScopePauseAction,
    onlyIfStillApplied = true,
  ): Promise<ScopePauseTarget[]> {
    const connectors =
      await ConnectorApiService.getConfiguredConnectors().catch(() => [])
    const failed: ScopePauseTarget[] = []
    for (const target of [...action.targets].reverse()) {
      const connector = this.findConnector(connectors, target.connectorIdentity)
      if (!connector) {
        failed.push(target)
        continue
      }
      try {
        await ConnectorApiService.restoreScopeMutation(
          connector,
          target.mutation,
          onlyIfStillApplied,
        )
      } catch (reason) {
        console.warn('Failed to restore a scope pause', reason)
        failed.push(target)
      }
    }
    return failed.reverse()
  }

  private static findConnector(
    connectors: ConnectorSettingsStorage[],
    identity: string,
  ): ConnectorSettingsStorage | undefined {
    return connectors.find(
      (connector) => getConnectorIdentity(connector) === identity,
    )
  }

  private static async getStorage(): Promise<ScopePauseStorage> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (values) => {
        resolve(
          (values[STORAGE_KEY] as ScopePauseStorage | undefined) ?? {
            actions: {},
          },
        )
      })
    })
  }

  private static saveStorage(storage: ScopePauseStorage): Promise<void> {
    return chrome.storage.local.set({ [STORAGE_KEY]: storage })
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
