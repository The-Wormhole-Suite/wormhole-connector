import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import {
  combineDomainStates,
  DomainBlockingState,
  evaluateDomainSearch,
} from './DomainStatusEvaluator'
import { BadgeService } from './BadgeService'
import PiHoleApiService from './PiHoleApiService'
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
    const globalStatus = await PiHoleApiService.getPiHoleStatusCombined()
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

    let piHoles
    try {
      piHoles = await PiHoleApiService.getConfiguredPiHoles()
    } catch (reason) {
      console.warn('Could not load configured Pi-hole instances', reason)
      return 'unknown'
    }

    const states = await Promise.all(
      piHoles.map(async (piHole): Promise<DomainBlockingState> => {
        try {
          const blockingStatus =
            await PiHoleApiService.getPiHoleStatusFor(piHole)
          if (blockingStatus.blocking === PiHoleApiStatusEnum.disabled) {
            return 'allowed'
          }
          if (blockingStatus.blocking !== PiHoleApiStatusEnum.enabled) {
            return 'unknown'
          }

          const groups = await PiHoleApiService.getGroups(piHole)
          const preferredGroup = preferredGroupName
            ? groups.find((item) => item.name === preferredGroupName)
            : undefined

          if (preferredGroup && !preferredGroup.enabled) {
            return 'allowed'
          }

          const group =
            preferredGroup ||
            groups.find((item) => item.enabled && item.name === 'Default') ||
            groups.find((item) => item.enabled)

          if (!group) {
            return 'unknown'
          }

          const search = await PiHoleApiService.searchDomain(piHole, domain)
          return evaluateDomainSearch(search, group.id)
        } catch (reason) {
          console.warn(
            `Could not determine the blocking status for ${domain}`,
            reason,
          )
          return 'unknown'
        }
      }),
    )

    return combineDomainStates(states)
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
    if (status === PiHoleApiStatusEnum.error) {
      return 'error'
    }
    return 'unknown'
  }
}
