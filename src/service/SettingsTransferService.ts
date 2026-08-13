import {
  ExtensionStorageEnum,
  ConnectorType,
  getConnectorType,
  GroupPauseTimeDefaults,
  PiHoleSettingsDefaults,
  TemporaryAllowTimeDefaults,
  type ConnectorSettingsStorage,
  type SyncCategory,
} from './StorageService'
import { getConnectorIdentity, normalizeConnectorAddress } from './ConnectorUrl'

export const SETTINGS_BACKUP_FORMAT = 'wormhole-connector-settings'
export const SETTINGS_SCHEMA_VERSION = 2

export type GeneralSettingsData = {
  hideGroupSelectorInPopup: boolean
  hideGroupListActionsInPopup: boolean
  badgeUsesSelectedGroup: boolean
  reloadAfterDisable: boolean
  reloadAfterWhitelist: boolean
  hideGlobalListActions: boolean
  disableContextMenu: boolean
}

export type TimerSettingsData = {
  defaultDisableTime: number
  groupPauseTimes: number[]
  temporaryAllowTimes: number[]
}

export type GroupSettingsData = {
  selectedGroup: string | null
}

export type AddressSettingsData = {
  connectors: Array<{
    type: ConnectorType
    address: string
  }>
}

export type TransferCategoryData = {
  general: GeneralSettingsData
  timers: TimerSettingsData
  group: GroupSettingsData
  addresses: AddressSettingsData
}

export type SettingsBackup = {
  format: typeof SETTINGS_BACKUP_FORMAT
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION
  exportedAt: string
  settings: TransferCategoryData
}

export type ImportPlan = {
  backup: SettingsBackup
  set: Record<string, unknown>
  remove: string[]
}

export const createSettingsBackup = (
  storage: Record<string, unknown>,
): SettingsBackup => ({
  format: SETTINGS_BACKUP_FORMAT,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  settings: {
    general: createCategoryData('general', storage),
    timers: createCategoryData('timers', storage),
    group: createCategoryData('group', storage),
    addresses: createCategoryData('addresses', storage),
  },
})

export const parseSettingsBackup = (input: unknown): SettingsBackup => {
  const root = requireObject(input, 'backup')
  requireKeys(
    root,
    ['format', 'schemaVersion', 'exportedAt', 'settings'],
    'backup',
  )
  if (root.format !== SETTINGS_BACKUP_FORMAT) {
    throw new Error('Unsupported backup format')
  }
  if (
    root.schemaVersion !== 1 &&
    root.schemaVersion !== SETTINGS_SCHEMA_VERSION
  ) {
    throw new Error(`Unsupported backup schema version: ${root.schemaVersion}`)
  }
  if (
    typeof root.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(root.exportedAt))
  ) {
    throw new Error('Backup export date is invalid')
  }

  const settings = requireObject(root.settings, 'settings')
  requireKeys(settings, ['general', 'timers', 'group', 'addresses'], 'settings')

  return {
    format: SETTINGS_BACKUP_FORMAT,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: root.exportedAt,
    settings: {
      general: validateCategoryData('general', settings.general),
      timers: validateCategoryData('timers', settings.timers),
      group: validateCategoryData('group', settings.group),
      addresses:
        root.schemaVersion === 1
          ? migrateLegacyAddressData(settings.addresses)
          : validateCategoryData('addresses', settings.addresses),
    },
  }
}

export const createImportPlan = (
  backup: SettingsBackup,
  currentConnections: ConnectorSettingsStorage[],
): ImportPlan => {
  const set: Record<string, unknown> = {}
  const remove: string[] = []

  Object.assign(set, categoryDataToStorage('general', backup.settings.general))
  Object.assign(set, categoryDataToStorage('timers', backup.settings.timers))
  Object.assign(set, categoryDataToStorage('group', backup.settings.group))
  Object.assign(
    set,
    categoryDataToStorage(
      'addresses',
      backup.settings.addresses,
      currentConnections,
    ),
  )

  if (backup.settings.group.selectedGroup === null) {
    delete set[ExtensionStorageEnum.pause_target]
    remove.push(ExtensionStorageEnum.pause_target)
  }

  return { backup, set, remove }
}

export function createCategoryData(
  category: 'general',
  storage: Record<string, unknown>,
): GeneralSettingsData
export function createCategoryData(
  category: 'timers',
  storage: Record<string, unknown>,
): TimerSettingsData
export function createCategoryData(
  category: 'group',
  storage: Record<string, unknown>,
): GroupSettingsData
export function createCategoryData(
  category: 'addresses',
  storage: Record<string, unknown>,
): AddressSettingsData
export function createCategoryData(
  category: SyncCategory,
  storage: Record<string, unknown>,
): TransferCategoryData[SyncCategory]
export function createCategoryData(
  category: SyncCategory,
  storage: Record<string, unknown>,
): TransferCategoryData[SyncCategory] {
  if (category === 'general') {
    return {
      hideGroupSelectorInPopup: getBoolean(
        storage,
        ExtensionStorageEnum.hide_group_selector_in_popup,
        false,
      ),
      hideGroupListActionsInPopup: getBoolean(
        storage,
        ExtensionStorageEnum.hide_group_list_actions_in_popup,
        false,
      ),
      badgeUsesSelectedGroup: getBoolean(
        storage,
        ExtensionStorageEnum.badge_uses_selected_group,
        false,
      ),
      reloadAfterDisable: getBoolean(
        storage,
        ExtensionStorageEnum.reload_after_disable,
        true,
      ),
      reloadAfterWhitelist: getBoolean(
        storage,
        ExtensionStorageEnum.reload_after_white_list,
        true,
      ),
      hideGlobalListActions: getBoolean(
        storage,
        ExtensionStorageEnum.disable_list_feature,
        false,
      ),
      disableContextMenu: getBoolean(
        storage,
        ExtensionStorageEnum.disable_context_menu,
        false,
      ),
    }
  }
  if (category === 'timers') {
    return {
      defaultDisableTime: getPositiveInteger(
        storage[ExtensionStorageEnum.default_disable_time],
        Number(PiHoleSettingsDefaults.default_disable_time),
      ),
      groupPauseTimes: getPresetTimes(
        storage[ExtensionStorageEnum.group_pause_times],
        GroupPauseTimeDefaults,
      ),
      temporaryAllowTimes: getPresetTimes(
        storage[ExtensionStorageEnum.temporary_allow_times],
        TemporaryAllowTimeDefaults,
      ),
    }
  }
  if (category === 'group') {
    const selectedGroup = storage[ExtensionStorageEnum.pause_target]
    return {
      selectedGroup:
        typeof selectedGroup === 'string' && selectedGroup.length > 0
          ? selectedGroup
          : null,
    }
  }

  const connections = storage[ExtensionStorageEnum.pi_hole_settings] as
    ConnectorSettingsStorage[] | undefined
  return {
    connectors: (connections ?? [])
      .filter((connection) => Boolean(connection.pi_uri_base))
      .map((connection) => ({
        type: getConnectorType(connection),
        address: normalizeConnectorAddress(connection),
      })),
  }
}

export function validateCategoryData(
  category: 'general',
  input: unknown,
): GeneralSettingsData
export function validateCategoryData(
  category: 'timers',
  input: unknown,
): TimerSettingsData
export function validateCategoryData(
  category: 'group',
  input: unknown,
): GroupSettingsData
export function validateCategoryData(
  category: 'addresses',
  input: unknown,
): AddressSettingsData
export function validateCategoryData(
  category: SyncCategory,
  input: unknown,
): TransferCategoryData[SyncCategory]
export function validateCategoryData(
  category: SyncCategory,
  input: unknown,
): TransferCategoryData[SyncCategory] {
  const data = requireObject(input, category)
  if (category === 'general') {
    const keys: Array<keyof GeneralSettingsData> = [
      'hideGroupSelectorInPopup',
      'hideGroupListActionsInPopup',
      'badgeUsesSelectedGroup',
      'reloadAfterDisable',
      'reloadAfterWhitelist',
      'hideGlobalListActions',
      'disableContextMenu',
    ]
    requireKeys(data, keys, category)
    for (const key of keys) {
      if (typeof data[key] !== 'boolean') {
        throw new Error(`${category}.${key} must be boolean`)
      }
    }
    return data as GeneralSettingsData
  }
  if (category === 'timers') {
    requireKeys(
      data,
      ['defaultDisableTime', 'groupPauseTimes', 'temporaryAllowTimes'],
      category,
    )
    return {
      defaultDisableTime: requirePositiveInteger(
        data.defaultDisableTime,
        'timers.defaultDisableTime',
      ),
      groupPauseTimes: requirePresetTimes(
        data.groupPauseTimes,
        'timers.groupPauseTimes',
      ),
      temporaryAllowTimes: requirePresetTimes(
        data.temporaryAllowTimes,
        'timers.temporaryAllowTimes',
      ),
    }
  }
  if (category === 'group') {
    requireKeys(data, ['selectedGroup'], category)
    if (data.selectedGroup !== null && typeof data.selectedGroup !== 'string') {
      throw new Error('group.selectedGroup must be a string or null')
    }
    return {
      selectedGroup:
        typeof data.selectedGroup === 'string' && data.selectedGroup.length > 0
          ? data.selectedGroup
          : null,
    }
  }

  requireKeys(data, ['connectors'], category)
  if (!Array.isArray(data.connectors) || data.connectors.length > 4) {
    throw new Error('addresses.connectors must contain at most four entries')
  }
  const connectors = data.connectors.map((input, index) => {
    const connector = requireObject(input, `addresses.connectors[${index}]`)
    requireKeys(
      connector,
      ['type', 'address'],
      `addresses.connectors[${index}]`,
    )
    if (
      connector.type !== ConnectorType.piHole &&
      connector.type !== ConnectorType.adguardHome
    ) {
      throw new Error('Every connector type must be supported')
    }
    if (typeof connector.address !== 'string') {
      throw new Error('Every connector address must be a string')
    }
    const value: ConnectorSettingsStorage = {
      connector_type: connector.type,
      pi_uri_base: connector.address,
    }
    return {
      type: connector.type,
      address: normalizeConnectorAddress(value),
    }
  })
  const identities = connectors.map(({ type, address }) => `${type}:${address}`)
  if (new Set(identities).size !== identities.length) {
    throw new Error('Connector addresses must be unique per backend type')
  }
  return { connectors }
}

export const categoryDataToStorage = (
  category: SyncCategory,
  input: unknown,
  currentConnections: ConnectorSettingsStorage[] = [],
): Record<string, unknown> => {
  const data = validateCategoryData(category, input)
  if (category === 'general') {
    const general = data as GeneralSettingsData
    return {
      [ExtensionStorageEnum.hide_group_selector_in_popup]:
        general.hideGroupSelectorInPopup,
      [ExtensionStorageEnum.hide_group_list_actions_in_popup]:
        general.hideGroupListActionsInPopup,
      [ExtensionStorageEnum.badge_uses_selected_group]:
        general.badgeUsesSelectedGroup,
      [ExtensionStorageEnum.reload_after_disable]: general.reloadAfterDisable,
      [ExtensionStorageEnum.reload_after_white_list]:
        general.reloadAfterWhitelist,
      [ExtensionStorageEnum.disable_list_feature]:
        general.hideGlobalListActions,
      [ExtensionStorageEnum.disable_context_menu]: general.disableContextMenu,
    }
  }
  if (category === 'timers') {
    const timers = data as TimerSettingsData
    return {
      [ExtensionStorageEnum.default_disable_time]: timers.defaultDisableTime,
      [ExtensionStorageEnum.group_pause_times]: [...timers.groupPauseTimes],
      [ExtensionStorageEnum.temporary_allow_times]: [
        ...timers.temporaryAllowTimes,
      ],
    }
  }
  if (category === 'group') {
    return {
      [ExtensionStorageEnum.pause_target]: (data as GroupSettingsData)
        .selectedGroup,
    }
  }

  const currentByIdentity = new Map(
    currentConnections
      .filter((connection) => connection.pi_uri_base)
      .map((connection) => [getConnectorIdentity(connection), connection]),
  )
  return {
    [ExtensionStorageEnum.pi_hole_settings]: (
      data as AddressSettingsData
    ).connectors.map(({ type, address }) => {
      const descriptor: ConnectorSettingsStorage = {
        connector_type: type,
        pi_uri_base: address,
      }
      const current = currentByIdentity.get(getConnectorIdentity(descriptor))
      const restored: ConnectorSettingsStorage = {
        ...descriptor,
        api_key: String(current?.api_key ?? ''),
      }
      if (type === ConnectorType.adguardHome) {
        restored.username = String(current?.username ?? '')
      }
      return restored
    }),
  }
}

export const getCategoryStorageKeys = (category: SyncCategory): string[] => {
  if (category === 'general') {
    return [
      ExtensionStorageEnum.hide_group_selector_in_popup,
      ExtensionStorageEnum.hide_group_list_actions_in_popup,
      ExtensionStorageEnum.badge_uses_selected_group,
      ExtensionStorageEnum.reload_after_disable,
      ExtensionStorageEnum.reload_after_white_list,
      ExtensionStorageEnum.disable_list_feature,
      ExtensionStorageEnum.disable_context_menu,
    ]
  }
  if (category === 'timers') {
    return [
      ExtensionStorageEnum.default_disable_time,
      ExtensionStorageEnum.group_pause_times,
      ExtensionStorageEnum.temporary_allow_times,
    ]
  }
  if (category === 'group') {
    return [ExtensionStorageEnum.pause_target]
  }
  return [ExtensionStorageEnum.pi_hole_settings]
}

const getBoolean = (
  storage: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean =>
  typeof storage[key] === 'boolean' ? (storage[key] as boolean) : fallback

const getPositiveInteger = (input: unknown, fallback: number): number =>
  Number.isInteger(input) && Number(input) >= 1 ? Number(input) : fallback

const getPresetTimes = (input: unknown, fallback: number[]): number[] =>
  Array.isArray(input) &&
  input.length === 3 &&
  input.every((value) => Number.isInteger(value) && value >= 10)
    ? input.map(Number)
    : [...fallback]

const requirePositiveInteger = (input: unknown, path: string): number => {
  if (!Number.isInteger(input) || Number(input) < 1) {
    throw new Error(`${path} must be a positive integer`)
  }
  return Number(input)
}

const requirePresetTimes = (input: unknown, path: string): number[] => {
  if (
    !Array.isArray(input) ||
    input.length !== 3 ||
    !input.every((value) => Number.isInteger(value) && value >= 10)
  ) {
    throw new Error(`${path} must contain three integers of at least 10`)
  }
  return input.map(Number)
}

const requireObject = (
  input: unknown,
  path: string,
): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${path} must be an object`)
  }
  return input as Record<string, unknown>
}

const requireKeys = (
  input: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
): void => {
  const actualKeys = Object.keys(input).sort()
  const expected = [...expectedKeys].sort()
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${path} contains missing or unknown fields`)
  }
}

const migrateLegacyAddressData = (input: unknown): AddressSettingsData => {
  const data = requireObject(input, 'addresses')
  requireKeys(data, ['piHoleAddresses'], 'addresses')
  if (!Array.isArray(data.piHoleAddresses) || data.piHoleAddresses.length > 4) {
    throw new Error('addresses.piHoleAddresses must contain at most four URLs')
  }
  return validateCategoryData('addresses', {
    connectors: data.piHoleAddresses.map((address) => ({
      type: ConnectorType.piHole,
      address,
    })),
  })
}
