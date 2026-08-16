import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import {
  composeToolbarIconState,
  getToolbarBadgePresentation,
  type GlobalToolbarIconState,
  type ToolbarIconState,
} from './BadgeState'

export enum ExtensionBadgeTextEnum {
  enabled = 'On',
  enabledBlocked = 'On!',
  disabled = 'Off',
  error = 'Err',
  info = 'Info',
  ok = 'Ok',
}

type IconDetails = {
  path: Record<number, string>
  tabId?: number
}

type BadgeDetails = {
  text: string
  tabId?: number
}

type BadgeColorDetails = {
  color: string
  tabId?: number
}

type ToolbarActionApi = {
  setIcon: (details: IconDetails) => void | Promise<void>
  setBadgeText: (details: BadgeDetails) => void | Promise<void>
  setBadgeBackgroundColor: (details: BadgeColorDetails) => void | Promise<void>
  setBadgeTextColor?: (details: BadgeColorDetails) => void | Promise<void>
}

/**
 * Cross-browser toolbar icon and native badge service.
 *
 * The legacy class and method names remain available so existing callers do not
 * break.
 */
export class BadgeService {
  private static readonly actionApi = (chrome.action ||
    chrome.browserAction) as ToolbarActionApi

  private static readonly iconPaths: Record<number, string> = {
    16: 'icon/icon-16.png',
    32: 'icon/icon-32.png',
    48: 'icon/icon-48.png',
  }

  private static globalState: GlobalToolbarIconState = 'unknown'

  private static readonly tabStates = new Map<number, ToolbarIconState>()

  public static setBadgeText(
    text: ExtensionBadgeTextEnum | string,
    tabId?: number,
  ): void {
    if (text === ExtensionBadgeTextEnum.info) {
      this.clearVisibleBadge(tabId)
      return
    }

    const state = this.convertBadgeTextToIconState(text)

    if (typeof tabId === 'undefined') {
      this.globalState = state === 'blocked' ? 'active' : state
    }

    this.setIconState(state, tabId)
  }

  public static setGlobalStatus(status: PiHoleApiStatusEnum): void {
    this.globalState = this.convertApiStatusToIconState(status)
    this.setIconState(this.globalState)
  }

  public static clearBadge(tabId?: number): void {
    if (typeof tabId === 'undefined') {
      this.globalState = 'unknown'
    }

    this.setIconState('unknown', tabId)
  }

  public static async setDomainBlockedBadge(
    tabId: number,
    blocked: boolean,
  ): Promise<void> {
    await this.setDomainStatusIcon(
      tabId,
      blocked ? 'blocked' : 'allowed',
      false,
    )
  }

  public static setDomainStatusIcon(
    tabId: number,
    domainState: 'allowed' | 'blocked' | 'unknown',
    temporary: boolean,
    temporaryRemainingSeconds?: number | null,
  ): Promise<void> {
    const iconState = composeToolbarIconState(
      this.globalState,
      temporary ? 'temporary' : domainState,
    )
    this.setIconState(iconState, tabId, temporaryRemainingSeconds)
    return Promise.resolve()
  }

  public static getBadgeText(tabId?: number): Promise<ExtensionBadgeTextEnum> {
    const state =
      typeof tabId === 'undefined'
        ? this.globalState
        : this.tabStates.get(tabId) || this.globalState

    return Promise.resolve(this.convertIconStateToBadgeText(state))
  }

  public static compareBadgeTextToApiStatusEnum(
    badgeText: ExtensionBadgeTextEnum,
    apiStatus: PiHoleApiStatusEnum,
  ): boolean {
    switch (badgeText) {
      case ExtensionBadgeTextEnum.enabled:
      case ExtensionBadgeTextEnum.enabledBlocked:
        return apiStatus === PiHoleApiStatusEnum.enabled
      case ExtensionBadgeTextEnum.disabled:
        return apiStatus === PiHoleApiStatusEnum.disabled
      default:
        return false
    }
  }

  private static setIconState(
    state: ToolbarIconState,
    tabId?: number,
    temporaryRemainingSeconds?: number | null,
  ): void {
    const details: IconDetails = {
      path: this.iconPaths,
    }

    if (typeof tabId !== 'undefined') {
      details.tabId = tabId
      this.tabStates.set(tabId, state)
    }

    this.actionApi.setIcon(details)
    this.setVisibleBadge(state, tabId, temporaryRemainingSeconds)
  }

  private static setVisibleBadge(
    state: ToolbarIconState,
    tabId?: number,
    temporaryRemainingSeconds?: number | null,
  ): void {
    const presentation = getToolbarBadgePresentation(
      state,
      temporaryRemainingSeconds,
    )
    const textDetails: BadgeDetails = { text: presentation.text }
    const backgroundDetails: BadgeColorDetails = {
      color: presentation.backgroundColor,
    }
    const textColorDetails: BadgeColorDetails = {
      color: presentation.textColor,
    }

    if (typeof tabId !== 'undefined') {
      textDetails.tabId = tabId
      backgroundDetails.tabId = tabId
      textColorDetails.tabId = tabId
    }

    this.actionApi.setBadgeBackgroundColor(backgroundDetails)
    this.actionApi.setBadgeTextColor?.(textColorDetails)
    this.actionApi.setBadgeText(textDetails)
  }

  private static clearVisibleBadge(tabId?: number): void {
    const details: BadgeDetails = { text: '' }
    if (typeof tabId !== 'undefined') {
      details.tabId = tabId
    }
    this.actionApi.setBadgeText(details)
  }

  private static convertApiStatusToIconState(
    status: PiHoleApiStatusEnum,
  ): GlobalToolbarIconState {
    if (status === PiHoleApiStatusEnum.enabled) {
      return 'active'
    }
    if (status === PiHoleApiStatusEnum.disabled) {
      return 'disabled'
    }
    if (status === PiHoleApiStatusEnum.error) {
      return 'error'
    }
    return 'unknown'
  }

  private static convertBadgeTextToIconState(
    input: ExtensionBadgeTextEnum | string,
  ): GlobalToolbarIconState | 'blocked' {
    switch (input) {
      case ExtensionBadgeTextEnum.enabled:
      case ExtensionBadgeTextEnum.ok:
        return 'active'
      case ExtensionBadgeTextEnum.enabledBlocked:
        return 'blocked'
      case ExtensionBadgeTextEnum.disabled:
        return 'disabled'
      case ExtensionBadgeTextEnum.error:
        return 'error'
      default:
        return 'unknown'
    }
  }

  private static convertIconStateToBadgeText(
    state: ToolbarIconState,
  ): ExtensionBadgeTextEnum {
    switch (state) {
      case 'active':
      case 'temporary':
        return ExtensionBadgeTextEnum.enabled
      case 'blocked':
        return ExtensionBadgeTextEnum.enabledBlocked
      case 'disabled':
        return ExtensionBadgeTextEnum.disabled
      default:
        return ExtensionBadgeTextEnum.error
    }
  }
}
