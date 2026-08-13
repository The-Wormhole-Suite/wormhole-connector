import { getPiHoleApiBase } from './PiHoleUrl'
import { getConnectorIdentity, normalizeConnectorAddress } from './ConnectorUrl'
import {
  ConnectorType,
  getConnectorType,
  type ConnectorSettingsStorage,
} from './ConnectorTypes'

export {
  ConnectorType,
  getConnectorType,
  type ConnectorSettingsStorage,
} from './ConnectorTypes'

/** @deprecated Use ConnectorSettingsStorage for new code. */
export type PiHoleSettingsStorage = ConnectorSettingsStorage

export enum PiHoleSettingsDefaults {
  pi_uri_base = 'http://pi.hole/admin',
  default_disable_time = 10,
}

export const AdGuardHomeSettingsDefaults = {
  address: 'http://adguard.local',
} as const

export const GroupPauseTimeDefaults = [60, 300, 900]
export const TemporaryAllowTimeDefaults = [60, 300, 900]

export interface ExtensionStorage {
  pi_hole_settings?: ConnectorSettingsStorage[]
  default_disable_time?: number
  group_pause_times?: number[]
  temporary_allow_times?: number[]
  pause_target?: string
  hide_group_selector_in_popup?: boolean
  hide_group_list_actions_in_popup?: boolean
  badge_uses_selected_group?: boolean
  reload_after_disable?: boolean
  reload_after_white_list?: boolean
  disable_list_feature?: boolean
  disable_update_notification?: boolean
  beta_feature_flag?: boolean
  disable_context_menu?: boolean
  sync_preferences_v1?: SyncPreferences
}

export type SyncCategory = 'general' | 'timers' | 'group' | 'addresses'

export type SyncPreferences = Record<SyncCategory, boolean>

export const SyncPreferenceDefaults: SyncPreferences = {
  general: false,
  timers: false,
  group: false,
  addresses: false,
}

export enum ExtensionStorageEnum {
  pi_hole_settings = 'pi_hole_settings',
  default_disable_time = 'default_disable_time',
  group_pause_times = 'group_pause_times',
  temporary_allow_times = 'temporary_allow_times',
  pause_target = 'pause_target',
  hide_group_selector_in_popup = 'hide_group_selector_in_popup',
  hide_group_list_actions_in_popup = 'hide_group_list_actions_in_popup',
  badge_uses_selected_group = 'badge_uses_selected_group',
  reload_after_disable = 'reload_after_disable',
  reload_after_white_list = 'reload_after_white_list',
  disable_list_feature = 'disable_list_feature',
  disable_update_notification = 'disable_update_notification',
  disable_context_menu = 'disable_context_menu',
  sync_preferences_v1 = 'sync_preferences_v1',
  session_storage = 'session_storage',
}

type StorageKey = string
type StorageValue<T> = {
  value: T
}

export class StorageService {
  private static readonly fallbackSessions = new Map<string, string>()

  public static async savePiHoleSettingsArray(
    settings: ConnectorSettingsStorage[],
  ): Promise<void> {
    const filteredSettings = settings.filter((value) => value.pi_uri_base)

    if (filteredSettings.length < 1) {
      await chrome.storage.local.remove(ExtensionStorageEnum.pi_hole_settings)
      return
    }

    if (filteredSettings.length > 4) {
      throw new Error('At most four connectors can be configured')
    }

    const secureSettings: ConnectorSettingsStorage[] = []

    for (const setting of filteredSettings) {
      const secureSetting: ConnectorSettingsStorage = {
        connector_type: getConnectorType(setting),
        pi_uri_base: normalizeConnectorAddress(setting),
        api_key: String(setting.api_key ?? ''),
      }
      if (getConnectorType(setting) === ConnectorType.adguardHome) {
        secureSetting.username = String(setting.username ?? '')
      }

      secureSettings.push(secureSetting)
      await this.removeSid(setting.pi_uri_base!)
    }

    const identities = secureSettings.map(getConnectorIdentity)
    if (new Set(identities).size !== identities.length) {
      throw new Error('Connector addresses must be unique per backend type')
    }

    await chrome.storage.local.set({
      pi_hole_settings: secureSettings,
    } satisfies ExtensionStorage)
  }

  public static saveConnectorSettingsArray(
    settings: ConnectorSettingsStorage[],
  ): Promise<void> {
    return this.savePiHoleSettingsArray(settings)
  }

  public static async saveDefaultDisableTime(time: number): Promise<void> {
    if (time < 1) {
      return
    }
    const storage: ExtensionStorage = {
      default_disable_time: time,
    }
    await chrome.storage.local.set(storage)
  }

  public static getDefaultDisableTime(): Promise<number | undefined> {
    return this.getStorageValue<number>(
      ExtensionStorageEnum.default_disable_time,
    )
  }

  public static async saveGroupPauseTimes(times: number[]): Promise<void> {
    const normalizedTimes = this.normalizePresetTimes(times)
    if (!normalizedTimes) {
      return
    }

    await chrome.storage.local.set({
      group_pause_times: normalizedTimes,
    } satisfies ExtensionStorage)
  }

  public static getGroupPauseTimes(): Promise<number[] | undefined> {
    return this.getStorageValue<number[]>(
      ExtensionStorageEnum.group_pause_times,
    )
  }

  public static async saveTemporaryAllowTimes(times: number[]): Promise<void> {
    const normalizedTimes = this.normalizePresetTimes(times)
    if (!normalizedTimes) {
      return
    }

    await chrome.storage.local.set({
      temporary_allow_times: normalizedTimes,
    } satisfies ExtensionStorage)
  }

  public static getTemporaryAllowTimes(): Promise<number[] | undefined> {
    return this.getStorageValue<number[]>(
      ExtensionStorageEnum.temporary_allow_times,
    )
  }

  public static async savePauseTarget(target: string): Promise<void> {
    if (!target) {
      return
    }

    const storage: ExtensionStorage = {
      pause_target: target,
    }
    await chrome.storage.local.set(storage)
  }

  public static getPauseTarget(): Promise<string | undefined> {
    return this.getStorageValue<string>(ExtensionStorageEnum.pause_target)
  }

  public static async saveHideGroupSelectorInPopup(
    state: boolean,
  ): Promise<void> {
    await chrome.storage.local.set({
      hide_group_selector_in_popup: state,
    } satisfies ExtensionStorage)
  }

  public static getHideGroupSelectorInPopup(): Promise<boolean> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.hide_group_selector_in_popup,
      false,
    )
  }

  public static async saveHideGroupListActionsInPopup(
    state: boolean,
  ): Promise<void> {
    await chrome.storage.local.set({
      hide_group_list_actions_in_popup: state,
    } satisfies ExtensionStorage)
  }

  public static getHideGroupListActionsInPopup(): Promise<boolean> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.hide_group_list_actions_in_popup,
      false,
    )
  }

  public static async saveBadgeUsesSelectedGroup(
    state: boolean,
  ): Promise<void> {
    await chrome.storage.local.set({
      badge_uses_selected_group: state,
    } satisfies ExtensionStorage)
  }

  public static getBadgeUsesSelectedGroup(): Promise<boolean> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.badge_uses_selected_group,
      false,
    )
  }

  public static async saveReloadAfterDisable(state: boolean): Promise<void> {
    const storage: ExtensionStorage = {
      reload_after_disable: state,
    }
    await chrome.storage.local.set(storage)
  }

  public static getReloadAfterDisable(): Promise<boolean | undefined> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.reload_after_disable,
    )
  }

  public static async saveReloadAfterWhitelist(state: boolean): Promise<void> {
    const storage: ExtensionStorage = {
      reload_after_white_list: state,
    }
    await chrome.storage.local.set(storage)
  }

  public static getReloadAfterWhitelist(): Promise<boolean | undefined> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.reload_after_white_list,
    )
  }

  public static getPiHoleSettingsArray(): Promise<
    ConnectorSettingsStorage[] | undefined
  > {
    return this.getStorageValue<ConnectorSettingsStorage[]>(
      ExtensionStorageEnum.pi_hole_settings,
    )
  }

  public static getConnectorSettingsArray(): Promise<
    ConnectorSettingsStorage[] | undefined
  > {
    return this.getPiHoleSettingsArray()
  }

  public static getDisableListFeature(): Promise<boolean | undefined> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.disable_list_feature,
    )
  }

  public static async saveDisableListFeature(state: boolean): Promise<void> {
    const storage: ExtensionStorage = {
      disable_list_feature: state,
    }
    await chrome.storage.local.set(storage)
  }

  public static getDisableContextMenu(): Promise<boolean> {
    return this.getStorageValue<boolean>(
      ExtensionStorageEnum.disable_context_menu,
      false,
    )
  }

  public static async saveDisableContextMenu(state: boolean): Promise<void> {
    const storage: ExtensionStorage = {
      disable_context_menu: state,
    }
    await chrome.storage.local.set(storage)
  }

  public static async getSid(url: string): Promise<string | undefined> {
    const key = this.getSessionKey(url)
    const sessionStorage = chrome.storage.session
    if (!sessionStorage) {
      return this.fallbackSessions.get(key)
    }

    const value = await this.getAreaValue<StorageValue<string>>(
      sessionStorage,
      key,
    )

    return value?.value
  }

  public static async saveSid(url: string, sid: string): Promise<void> {
    const key = this.getSessionKey(url)
    const value: StorageValue<string> = {
      value: sid,
    }
    const sessionStorage = chrome.storage.session
    if (!sessionStorage) {
      this.fallbackSessions.set(key, sid)
      return
    }
    await sessionStorage.set({ [key]: value })
  }

  public static async removeSid(url: string): Promise<void> {
    const key = this.getSessionKey(url)
    this.fallbackSessions.delete(key)
    await chrome.storage.session?.remove(key)
  }

  public static async removeAllSids(): Promise<void> {
    this.fallbackSessions.clear()

    if (chrome.storage.session) {
      const values = await this.getAreaValues(chrome.storage.session)
      const keys = Object.keys(values).filter((key) =>
        key.startsWith(`${ExtensionStorageEnum.session_storage}_`),
      )
      if (keys.length > 0) {
        await chrome.storage.session.remove(keys)
      }
    }

    const legacyValues = await this.getAreaValues(chrome.storage.local)
    const legacyKeys = Object.keys(legacyValues).filter((key) =>
      key.startsWith(`${ExtensionStorageEnum.session_storage}_`),
    )
    if (legacyKeys.length > 0) {
      await chrome.storage.local.remove(legacyKeys)
    }
  }

  public static async getSyncPreferences(): Promise<SyncPreferences> {
    const stored = await this.getStorageValue<Partial<SyncPreferences>>(
      ExtensionStorageEnum.sync_preferences_v1,
    )
    return {
      ...SyncPreferenceDefaults,
      ...stored,
    }
  }

  public static async saveSyncPreferences(
    preferences: SyncPreferences,
  ): Promise<void> {
    await chrome.storage.local.set({
      sync_preferences_v1: { ...preferences },
    } satisfies ExtensionStorage)
  }

  public static getAllLocalValues(): Promise<Record<string, unknown>> {
    return this.getAreaValues(chrome.storage.local)
  }

  public static async setLocalValues(
    values: Record<string, unknown>,
  ): Promise<void> {
    await chrome.storage.local.set(values)
  }

  public static async removeLocalValues(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await chrome.storage.local.remove(keys)
    }
  }

  private static normalizePresetTimes(times: number[]): number[] | undefined {
    const normalizedTimes = times.map(Number)
    const isValid =
      normalizedTimes.length === 3 &&
      normalizedTimes.every((time) => Number.isInteger(time) && time >= 10)

    return isValid ? normalizedTimes : undefined
  }

  private static getSessionKey(url: string): StorageKey {
    return `${ExtensionStorageEnum.session_storage}_${getPiHoleApiBase(url)}`
  }

  private static getAreaValues(
    area: chrome.storage.StorageArea,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      area.get(null, (values) => resolve(values as Record<string, unknown>))
    })
  }

  private static getAreaValue<T>(
    area: chrome.storage.StorageArea,
    key: StorageKey,
  ): Promise<T | undefined> {
    return new Promise((resolve) => {
      area.get(key, (obj) => resolve(obj[key] as T | undefined))
    })
  }

  private static getStorageValue<T>(key: StorageKey): Promise<T | undefined>

  private static getStorageValue<T>(
    key: StorageKey,
    defaultUnsetValue: T,
  ): Promise<T>

  private static getStorageValue<T>(
    key: StorageKey,
    defaultUnsetValue?: T,
  ): Promise<T | undefined> | Promise<T> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (obj) => {
        const storageValue = obj[key] as T | undefined

        if (
          typeof defaultUnsetValue !== 'undefined' &&
          typeof storageValue === 'undefined'
        ) {
          resolve(defaultUnsetValue)
          return
        }

        resolve(storageValue)
      })
    })
  }
}
