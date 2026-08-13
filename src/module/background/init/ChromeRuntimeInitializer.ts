import { Initializer } from '../../general/Initializer'
import {
  GroupPauseTimeDefaults,
  PiHoleSettingsDefaults,
  StorageService,
  TemporaryAllowTimeDefaults,
} from '../../../service/StorageService'
import { compareVersions } from '../../../service/VersionService'

export default class ChromeRuntimeInitializer implements Initializer {
  public init(): void {
    this.initializeDefaults().catch((reason) => {
      console.error('Failed to initialize extension defaults', reason)
    })

    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstalled(details).catch((reason) => {
        console.error('Failed to migrate extension settings', reason)
      })
    })
  }

  private async handleInstalled(
    details: chrome.runtime.InstalledDetails,
  ): Promise<void> {
    await this.initializeDefaults()

    if (details.reason !== 'update' || !details.previousVersion) {
      return
    }

    const currentVersion = chrome.runtime.getManifest().version
    if (compareVersions(details.previousVersion, currentVersion) >= 0) {
      return
    }

    console.log(`Updated from ${details.previousVersion} to ${currentVersion}`)
    // Authentication sessions are intentionally not migrated. User settings,
    // including connection addresses and passwords, remain intact.
    await StorageService.removeAllSids()
  }

  private async initializeDefaults(): Promise<void> {
    const [defaultTime, groupTimes, allowTimes, reloadDisable, reloadAllow] =
      await Promise.all([
        StorageService.getDefaultDisableTime(),
        StorageService.getGroupPauseTimes(),
        StorageService.getTemporaryAllowTimes(),
        StorageService.getReloadAfterDisable(),
        StorageService.getReloadAfterWhitelist(),
      ])

    await Promise.all([
      typeof defaultTime === 'undefined'
        ? StorageService.saveDefaultDisableTime(
            Number(PiHoleSettingsDefaults.default_disable_time),
          )
        : Promise.resolve(),
      typeof groupTimes === 'undefined'
        ? StorageService.saveGroupPauseTimes([...GroupPauseTimeDefaults])
        : Promise.resolve(),
      typeof allowTimes === 'undefined'
        ? StorageService.saveTemporaryAllowTimes([
            ...TemporaryAllowTimeDefaults,
          ])
        : Promise.resolve(),
      typeof reloadDisable === 'undefined'
        ? StorageService.saveReloadAfterDisable(true)
        : Promise.resolve(),
      typeof reloadAllow === 'undefined'
        ? StorageService.saveReloadAfterWhitelist(true)
        : Promise.resolve(),
    ])
  }
}
