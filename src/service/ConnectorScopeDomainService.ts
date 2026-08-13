import ApiList from '../api/enum/ApiList'
import ConnectorApiService, {
  type ConnectorDomainMutation,
} from './ConnectorApiService'
import { getConnectorIdentity } from './ConnectorUrl'
import OperationCoordinator from './OperationCoordinator'
import { ConnectorType, type ConnectorSettingsStorage } from './StorageService'

const STORAGE_KEY = 'wormhole_scope_domain_actions_v1'
const ALARM_PREFIX = 'wormhole.scopeDomain.v1.'
const RESTORE_RETRY_DELAY = 60 * 1000

type ScopeDomainTarget = {
  connectorIdentity: string
  mutation: ConnectorDomainMutation
}

type ScopeDomainAction = {
  domain: string
  scopeName: string
  expiresAt: number
  targets: ScopeDomainTarget[]
}

type ScopeDomainStorage = {
  actions: Record<string, ScopeDomainAction>
}

export default class ConnectorScopeDomainService {
  public static async initialize(): Promise<void> {
    const storage = await this.getStorage()
    for (const [key, action] of Object.entries(storage.actions)) {
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

  public static setDomainListForScope(
    list: ApiList,
    domain: string,
    scopeName: string,
  ): Promise<void> {
    return ConnectorApiService.setDomainListForScope(list, domain, scopeName)
  }

  public static async temporarilyAllowDomainForScope(
    domain: string,
    scopeName: string,
    durationSeconds: number,
  ): Promise<void> {
    if (!domain || !scopeName) {
      throw new Error('Domain and scope are required')
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
      throw new Error('Temporary allow duration must be a positive integer')
    }
    const key = this.createKey(domain, scopeName)
    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `domain:${domain}`, `scope:${scopeName}`],
      () => this.applyTemporaryAllow(key, domain, scopeName, durationSeconds),
    )
  }

  public static async cancelTemporaryAllowsForDomain(
    domain: string,
  ): Promise<void> {
    if (!domain) {
      return
    }
    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `domain:${domain}`],
      async () => {
        const storage = await this.getStorage()
        const matches = Object.entries(storage.actions).filter(
          ([, action]) => action.domain === domain,
        )
        const retryAlarms: Array<{ name: string; when: number }> = []
        for (const [key, action] of matches) {
          const failedTargets = await this.restoreTargets(
            action,
            true,
            ConnectorType.adguardHome,
          )
          if (failedTargets.length > 0) {
            action.targets = failedTargets
            action.expiresAt = Date.now() + RESTORE_RETRY_DELAY
            storage.actions[key] = action
            retryAlarms.push({
              name: `${ALARM_PREFIX}${key}`,
              when: action.expiresAt,
            })
          } else {
            delete storage.actions[key]
            await this.clearAlarm(`${ALARM_PREFIX}${key}`)
          }
        }
        if (matches.length > 0) {
          await this.saveStorage(storage)
          await Promise.all(
            retryAlarms.map(({ name, when }) => this.createAlarm(name, when)),
          )
        }
      },
    )
  }

  private static async applyTemporaryAllow(
    key: string,
    domain: string,
    scopeName: string,
    durationSeconds: number,
  ): Promise<void> {
    let storage = await this.getStorage()
    if (storage.actions[key]) {
      await this.restoreActionLocked(key)
      storage = await this.getStorage()
      if (storage.actions[key]) {
        throw new Error('The previous temporary scope rule is still recovering')
      }
    }

    const connectors = await ConnectorApiService.getConfiguredConnectors()
    const prepared = await Promise.all(
      connectors.map(async (connector) => ({
        connector,
        mutation: await ConnectorApiService.prepareDomainMutation(
          connector,
          ApiList.whitelist,
          domain,
          scopeName,
        ),
      })),
    )
    const action: ScopeDomainAction = {
      domain,
      scopeName,
      expiresAt: Date.now() + durationSeconds * 1000,
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
        await ConnectorApiService.applyDomainMutation(
          item.connector,
          item.mutation,
        )
      }
      await this.createAlarm(`${ALARM_PREFIX}${key}`, action.expiresAt)
    } catch (reason) {
      const failedTargets = await this.restoreTargets(action, false)
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

  private static async restoreAction(key: string): Promise<void> {
    const storage = await this.getStorage()
    const action = storage.actions[key]
    if (!action) {
      return
    }
    await OperationCoordinator.runExclusive(
      [STORAGE_KEY, `domain:${action.domain}`, `scope:${action.scopeName}`],
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
    action: ScopeDomainAction,
    onlyIfStillApplied = true,
    backend?: ConnectorType,
  ): Promise<ScopeDomainTarget[]> {
    const connectors =
      await ConnectorApiService.getConfiguredConnectors().catch(() => [])
    const failed: ScopeDomainTarget[] = []
    for (const target of [...action.targets].reverse()) {
      if (backend && target.mutation.backend !== backend) {
        continue
      }
      const connector = this.findConnector(connectors, target.connectorIdentity)
      if (!connector) {
        failed.push(target)
        continue
      }
      try {
        await ConnectorApiService.restoreDomainMutation(
          connector,
          target.mutation,
          onlyIfStillApplied,
        )
      } catch (reason) {
        console.warn('Failed to restore a temporary scope rule', reason)
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

  private static createKey(domain: string, scopeName: string): string {
    return encodeURIComponent(`${domain}\n${scopeName}`)
  }

  private static async getStorage(): Promise<ScopeDomainStorage> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (values) => {
        resolve(
          (values[STORAGE_KEY] as ScopeDomainStorage | undefined) ?? {
            actions: {},
          },
        )
      })
    })
  }

  private static saveStorage(storage: ScopeDomainStorage): Promise<void> {
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
