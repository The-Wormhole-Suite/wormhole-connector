import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import { BadgeService } from './BadgeService'
import { StorageService } from './StorageService'
import ConnectorApiService from './ConnectorApiService'
import TabService from './TabService'
import ApiList from '../api/enum/ApiList'
import DomainStatusService from './DomainStatusService'
import ConnectorScopeDomainService from './ConnectorScopeDomainService'
import GroupDomainService from './GroupDomainService'

export default class BackgroundService {
  public static async togglePiHole(): Promise<void> {
    try {
      const currentStatus =
        await ConnectorApiService.getProtectionStatusCombined()
      if (currentStatus === PiHoleApiStatusEnum.error) {
        BadgeService.setGlobalStatus(PiHoleApiStatusEnum.error)
        return
      }

      const newStatus =
        currentStatus === PiHoleApiStatusEnum.enabled
          ? PiHoleApiStatusEnum.disabled
          : PiHoleApiStatusEnum.enabled
      const responses = await ConnectorApiService.changeProtection(newStatus, 0)
      if (responses.some((response) => response.blocking !== newStatus)) {
        throw new Error('One DNS connector returned an unexpected state')
      }

      BadgeService.setGlobalStatus(newStatus)
      await DomainStatusService.refreshActiveTabBadges()
      if (await StorageService.getReloadAfterDisable()) {
        TabService.reloadCurrentTab(1500)
      }
    } catch (reason) {
      console.warn(reason)
      BadgeService.setGlobalStatus(PiHoleApiStatusEnum.error)
    }
  }

  public static async blacklistCurrentDomain(): Promise<void> {
    const domain = await TabService.getCurrentTabUrlCleaned()
    if (!domain) {
      await this.refreshBadges()
      return
    }

    try {
      await ConnectorApiService.setDomainListGlobally(ApiList.blacklist, domain)
      await Promise.all([
        ConnectorScopeDomainService.cancelTemporaryAllowsForDomain(domain),
        GroupDomainService.cancelTemporaryAllowsForDomain(domain),
      ])
      await this.refreshBadges()
    } catch (reason) {
      console.warn(reason)
      BadgeService.setGlobalStatus(PiHoleApiStatusEnum.error)
    }
  }

  public static async whitelistCurrentDomain(): Promise<void> {
    const domain = await TabService.getCurrentTabUrlCleaned()
    if (!domain) {
      await this.refreshBadges()
      return
    }

    try {
      await ConnectorApiService.setDomainListGlobally(ApiList.whitelist, domain)
      await Promise.all([
        ConnectorScopeDomainService.cancelTemporaryAllowsForDomain(domain),
        GroupDomainService.cancelTemporaryAllowsForDomain(domain),
      ])
      await this.refreshBadges()

      if (await StorageService.getReloadAfterWhitelist()) {
        TabService.reloadCurrentTab(1500)
      }
    } catch (reason) {
      console.warn(reason)
      BadgeService.setGlobalStatus(PiHoleApiStatusEnum.error)
    }
  }

  public static openOptions(): void {
    chrome.runtime.openOptionsPage()
  }

  private static async refreshBadges(): Promise<void> {
    const status = await ConnectorApiService.getProtectionStatusCombined()
    BadgeService.setGlobalStatus(status)
    await DomainStatusService.refreshActiveTabBadges()
  }
}
