import PiHoleApiService from './PiHoleApiService'
import {
  categoryDataToStorage,
  createCategoryData,
  getCategoryStorageKeys,
  SETTINGS_SCHEMA_VERSION,
  validateCategoryData,
} from './SettingsTransferService'
import {
  ConnectorType,
  ExtensionStorageEnum,
  getConnectorType,
  StorageService,
  type SyncCategory,
  type SyncPreferences,
} from './StorageService'

const SYNC_KEY_PREFIX = 'wormhole_connector_sync_v2_'
const LEGACY_SYNC_KEY_PREFIX = 'wormhole_connector_sync_v1_'
export const SYNC_CATEGORIES: SyncCategory[] = [
  'general',
  'timers',
  'group',
  'addresses',
]

type SyncEnvelope = {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION
  updatedAt: string
  data: unknown
}

export default class BrowserSyncService {
  private static readonly suppressedLocalKeys = new Set<string>()

  public static async initialize(): Promise<void> {
    await chrome.storage.sync.remove(
      SYNC_CATEGORIES.map((category) => `${LEGACY_SYNC_KEY_PREFIX}${category}`),
    )
    const preferences = await StorageService.getSyncPreferences()
    for (const category of SYNC_CATEGORIES) {
      if (preferences[category]) {
        await this.reconcileCategory(category)
      }
    }
  }

  public static async setCategoryEnabled(
    category: SyncCategory,
    enabled: boolean,
  ): Promise<SyncPreferences> {
    const preferences = await StorageService.getSyncPreferences()
    preferences[category] = enabled
    await StorageService.saveSyncPreferences(preferences)

    if (enabled) {
      await this.reconcileCategory(category)
    } else {
      await chrome.storage.sync.remove(this.getSyncKey(category))
    }
    return preferences
  }

  public static async syncNow(): Promise<void> {
    const preferences = await StorageService.getSyncPreferences()
    for (const category of SYNC_CATEGORIES) {
      if (preferences[category]) {
        await this.publishCategory(category)
      }
    }
  }

  public static async handleLocalChanges(
    changes: Record<string, chrome.storage.StorageChange>,
  ): Promise<void> {
    const changedKeys = Object.keys(changes).filter((key) => {
      if (this.suppressedLocalKeys.has(key)) {
        this.suppressedLocalKeys.delete(key)
        return false
      }
      return key !== ExtensionStorageEnum.sync_preferences_v1
    })
    if (changedKeys.length === 0) {
      return
    }

    const preferences = await StorageService.getSyncPreferences()
    for (const category of SYNC_CATEGORIES) {
      if (
        preferences[category] &&
        getCategoryStorageKeys(category).some((key) =>
          changedKeys.includes(key),
        )
      ) {
        await this.publishCategory(category)
      }
    }
  }

  public static async handleSyncChanges(
    changes: Record<string, chrome.storage.StorageChange>,
  ): Promise<void> {
    const preferences = await StorageService.getSyncPreferences()
    for (const category of SYNC_CATEGORIES) {
      const change = changes[this.getSyncKey(category)]
      if (!change?.newValue || !preferences[category]) {
        continue
      }
      const envelope = this.validateEnvelope(change.newValue, category)
      await this.applyCategory(category, envelope.data)
    }
  }

  private static async reconcileCategory(
    category: SyncCategory,
  ): Promise<void> {
    const key = this.getSyncKey(category)
    const values = await this.getSyncValues(key)
    const remote = values[key]
    if (typeof remote === 'undefined') {
      await this.publishCategory(category)
      return
    }

    const envelope = this.validateEnvelope(remote, category)
    await this.applyCategory(category, envelope.data)
  }

  private static async publishCategory(category: SyncCategory): Promise<void> {
    const storage = await StorageService.getAllLocalValues()
    const envelope: SyncEnvelope = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      data: createCategoryData(category, storage),
    }
    await chrome.storage.sync.set({ [this.getSyncKey(category)]: envelope })
  }

  private static async applyCategory(
    category: SyncCategory,
    data: unknown,
  ): Promise<void> {
    const currentConnections =
      (await StorageService.getPiHoleSettingsArray()) ?? []
    const values = categoryDataToStorage(category, data, currentConnections)
    const keys = Object.keys(values)
    keys.forEach((key) => this.suppressedLocalKeys.add(key))

    if (category === 'addresses') {
      await PiHoleApiService.endSessions(
        currentConnections.filter(
          (connection) => getConnectorType(connection) === ConnectorType.piHole,
        ),
      )
      await StorageService.removeAllSids()
    }

    if (
      category === 'group' &&
      values[ExtensionStorageEnum.pause_target] === null
    ) {
      delete values[ExtensionStorageEnum.pause_target]
      this.suppressedLocalKeys.add(ExtensionStorageEnum.pause_target)
      await StorageService.removeLocalValues([
        ExtensionStorageEnum.pause_target,
      ])
    }

    if (Object.keys(values).length > 0) {
      await StorageService.setLocalValues(values)
    }
  }

  private static validateEnvelope(
    input: unknown,
    category: SyncCategory,
  ): SyncEnvelope {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Synchronized settings envelope is invalid')
    }
    const envelope = input as Record<string, unknown>
    const keys = Object.keys(envelope).sort()
    if (keys.join(',') !== 'data,schemaVersion,updatedAt') {
      throw new Error('Synchronized settings contain unknown fields')
    }
    if (envelope.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      throw new Error('Synchronized settings use an unsupported version')
    }
    if (
      typeof envelope.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(envelope.updatedAt))
    ) {
      throw new Error('Synchronized settings timestamp is invalid')
    }

    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      updatedAt: envelope.updatedAt,
      data: validateCategoryData(category, envelope.data),
    }
  }

  private static getSyncKey(category: SyncCategory): string {
    return `${SYNC_KEY_PREFIX}${category}`
  }

  private static getSyncValues(key: string): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(key, (values) => {
        resolve(values as Record<string, unknown>)
      })
    })
  }
}
