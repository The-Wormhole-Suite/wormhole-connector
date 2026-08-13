import { BadgeService } from '../../../service/BadgeService'
import ContextMenuInitializer from './ContextMenuInitializer'
import ChromeRuntimeInitializer from './ChromeRuntimeInitializer'
import { Initializer } from '../../general/Initializer'
import HotKeyInitializer from './HotKeyInitializer'
import TemporaryActionService from '../../../service/TemporaryActionService'
import GroupPauseService from '../../../service/GroupPauseService'
import GroupDomainService from '../../../service/GroupDomainService'
import DomainStatusService from '../../../service/DomainStatusService'
import { ExtensionStorageEnum } from '../../../service/StorageService'
import ConnectorApiService from '../../../service/ConnectorApiService'
import BrowserSyncService from '../../../service/BrowserSyncService'
import ConnectorScopeDomainService from '../../../service/ConnectorScopeDomainService'
import ConnectorScopePauseService from '../../../service/ConnectorScopePauseService'

export default class BackgroundInitializer implements Initializer {
  private readonly ALARM_NAME = 'pihole.refreshBadges'

  private readonly INTERVAL_TIMEOUT = 30000

  public init(): void {
    BadgeService.clearBadge()

    new ContextMenuInitializer().init()
    new ChromeRuntimeInitializer().init()
    new HotKeyInitializer().init()

    this.addAlarmListener()
    this.addTabListeners()
    this.addStorageListener()
    this.refreshAllIcons().catch((reason) => {
      console.error('Failed to initialize extension toolbar icons', reason)
    })
    this.createAlarm().catch(() => {
      console.error('Failed to create toolbar icon refresh alarm')
    })
    TemporaryActionService.initialize().catch((reason) => {
      console.error('Failed to initialize temporary actions', reason)
    })
    GroupDomainService.initialize().catch((reason) => {
      console.error('Failed to initialize group domain actions', reason)
    })
    GroupPauseService.initialize().catch((reason) => {
      console.error('Failed to initialize client-group pauses', reason)
    })
    ConnectorScopeDomainService.initialize().catch((reason) => {
      console.error('Failed to initialize scope domain actions', reason)
    })
    ConnectorScopePauseService.initialize().catch((reason) => {
      console.error('Failed to initialize scope pauses', reason)
    })
    BrowserSyncService.initialize().catch((reason) => {
      console.error('Failed to initialize browser synchronization', reason)
    })
  }

  private async createAlarm(): Promise<void> {
    if (typeof browser !== 'undefined') {
      browser.alarms.create(this.ALARM_NAME, {
        periodInMinutes: this.INTERVAL_TIMEOUT / 60000,
      })
      return
    }

    await chrome.alarms.create(this.ALARM_NAME, {
      periodInMinutes: this.INTERVAL_TIMEOUT / 60000,
    })
  }

  private addAlarmListener(): void {
    const alarmHandler = (alarm: { name: string }) => {
      if (alarm.name === this.ALARM_NAME) {
        this.refreshAllIcons().catch((reason) => {
          console.error('Failed to refresh extension toolbar icons', reason)
        })
        return
      }

      Promise.all([
        GroupPauseService.handleAlarm(alarm.name),
        GroupDomainService.handleAlarm(alarm.name),
        TemporaryActionService.handleAlarm(alarm.name),
        ConnectorScopeDomainService.handleAlarm(alarm.name),
        ConnectorScopePauseService.handleAlarm(alarm.name),
      ])
        .then(() => this.refreshAllIcons())
        .catch((reason) => {
          console.error('Failed to handle extension alarm', reason)
        })
    }

    if (typeof browser !== 'undefined') {
      browser.alarms.onAlarm.addListener(alarmHandler)
    } else {
      chrome.alarms.onAlarm.addListener(alarmHandler)
    }
  }

  private addTabListeners(): void {
    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs.get(tabId, (tab) => {
        DomainStatusService.refreshTabIcon(tab).catch((reason) => {
          console.error('Failed to refresh the activated tab icon', reason)
        })
      })
    })

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (!changeInfo.url && changeInfo.status !== 'complete') {
        return
      }

      DomainStatusService.refreshTabIcon(tab).catch((reason) => {
        console.error('Failed to refresh the updated tab icon', reason)
      })
    })

    chrome.windows.onFocusChanged.addListener(() => {
      DomainStatusService.refreshActiveTabIcons().catch((reason) => {
        console.error('Failed to refresh focused-window icons', reason)
      })
    })
  }

  private addStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        BrowserSyncService.handleSyncChanges(changes).catch((reason) => {
          console.error('Failed to apply synchronized settings', reason)
        })
        return
      }

      if (areaName === 'local') {
        BrowserSyncService.handleLocalChanges(changes).catch((reason) => {
          console.error('Failed to publish synchronized settings', reason)
        })
      }

      if (
        areaName !== 'local' ||
        (!changes[ExtensionStorageEnum.pause_target] &&
          !changes[ExtensionStorageEnum.pi_hole_settings] &&
          !changes[ExtensionStorageEnum.badge_uses_selected_group])
      ) {
        return
      }

      this.refreshAllIcons().catch((reason) => {
        console.error(
          'Failed to refresh toolbar icons after a settings change',
          reason,
        )
      })
    })
  }

  private async refreshAllIcons(): Promise<void> {
    const status = await ConnectorApiService.getProtectionStatusCombined()
    BadgeService.setGlobalStatus(status)
    await DomainStatusService.refreshActiveTabIcons()
  }
}
