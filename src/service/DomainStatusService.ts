import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import { DomainBlockingState } from './DomainStatusEvaluator'
import { BadgeService } from './BadgeService'
import ConnectorApiService from './ConnectorApiService'
import { StorageService } from './StorageService'
import TabService from './TabService'
import TemporaryIconStateService from './TemporaryIconStateService'
import {
  composeToolbarIconState,
  type GlobalToolbarIconState,
  type ToolbarIconState,
} from './BadgeState'

export type CurrentDomainStatus = {
  domain: string
  state: DomainBlockingState
  groupName: string | null
}

export default class DomainStatusService {
  public static async getCurrentToolbarIconState(): Promise<ToolbarIconState> {
    const globalStatus = await ConnectorApiService.getProtectionStatusCombined()
    const globalState = this.toGlobalToolbarIconState(globalStatus)

    if (globalState !== 'active') {
      return globalState
    }

    const tab = await TabService.getCurrentTab()
    if (!tab) {
      return composeToolbarIconState(globalState, 'unknown')
    }

    const domain = await TabService.getTabUrlCleaned(tab)
    if (!domain) {
      return composeToolbarIconState(globalState, 'unknown')
    }

    const groupName = await this.getIconGroupName()
    const domainState = await this.getDomainStatus(domain, groupName)
    const temporary =
      domainState === 'allowed' &&
      (await TemporaryIconStateService.isActive(domain, groupName))

    return composeToolbarIconState(
      globalState,
      temporary ? 'temporary' : domainState,
    )
  }

  public static async getDomainStatus(
    domain: string,
    preferredGroupName?: string | null,
  ): Promise<DomainBlockingState> {
    if (!domain) {
      return 'unknown'
    }

    return ConnectorApiService.getDomainStatus(domain, preferredGroupName)
  }

  public static async refreshCurrentTabIcon(
    preferredGroupName?: string | null,
  ): Promise<CurrentDomainStatus> {
    const tab = await TabService.getCurrentTab()
    if (!tab) {
      return { domain: '', state: 'unknown', groupName: null }
    }

    return this.refreshTabIcon(tab, preferredGroupName)
  }

  public static async refreshTabIcon(
    tab: chrome.tabs.Tab,
    preferredGroupName?: string | null,
  ): Promise<CurrentDomainStatus> {
    const tabId = tab.id
    const domain = await TabService.getTabUrlCleaned(tab)
    const groupName =
      typeof preferredGroupName === 'undefined'
        ? await this.getIconGroupName()
        : preferredGroupName

    if (typeof tabId === 'undefined' || !domain) {
      if (typeof tabId !== 'undefined') {
        await BadgeService.setDomainStatusIcon(tabId, 'unknown', false)
      }
      return { domain: '', state: 'unknown', groupName }
    }

    const state = await this.getDomainStatus(domain, groupName)
    const temporaryRemainingSeconds =
      state === 'allowed'
        ? await TemporaryIconStateService.getRemainingSeconds(domain, groupName)
        : null
    const temporary = temporaryRemainingSeconds !== null

    await BadgeService.setDomainStatusIcon(
      tabId,
      state,
      temporary,
      temporary ? temporaryRemainingSeconds : null,
    )
    return { domain, state, groupName }
  }

  public static async refreshActiveTabIcons(): Promise<void> {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true }, resolve)
    })

    await Promise.all(tabs.map((tab) => this.refreshTabIcon(tab)))
  }

  /**
   * Backwards-compatible aliases retained for existing popup/background callers.
   */
  public static async refreshCurrentTabBadge(
    preferredGroupName?: string | null,
  ): Promise<CurrentDomainStatus> {
    return this.refreshCurrentTabIcon(preferredGroupName)
  }

  public static async refreshTabBadge(
    tab: chrome.tabs.Tab,
    preferredGroupName?: string | null,
  ): Promise<CurrentDomainStatus> {
    return this.refreshTabIcon(tab, preferredGroupName)
  }

  public static async refreshActiveTabBadges(): Promise<void> {
    return this.refreshActiveTabIcons()
  }

  private static async getIconGroupName(): Promise<string | null> {
    if (!(await StorageService.getBadgeUsesSelectedGroup())) {
      return null
    }

    return (await StorageService.getPauseTarget()) || null
  }

  private static toGlobalToolbarIconState(
    status: PiHoleApiStatusEnum,
  ): GlobalToolbarIconState {
    if (status === PiHoleApiStatusEnum.enabled) {
      return 'active'
    }
    if (status === PiHoleApiStatusEnum.disabled) {
      return 'disabled'
    }
    if (status === PiHoleApiStatusEnum.mixed) {
      return 'mixed'
    }
    if (status === PiHoleApiStatusEnum.error) {
      return 'error'
    }
    return 'unknown'
  }
}
