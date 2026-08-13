import { Initializer } from '../../general/Initializer'
import { I18NContextMenuKeys, I18NService } from '../../../service/i18NService'
import BackgroundService from '../../../service/BackgroundService'
import {
  ExtensionStorageEnum,
  StorageService,
} from '../../../service/StorageService'
import CreateProperties = chrome.contextMenus.CreateProperties

export default class ContextMenuInitializer implements Initializer {
  private updateRequestId = 0

  private get contextMenusConfigurations(): CreateProperties[] {
    return [
      {
        title: I18NService.translate(I18NContextMenuKeys.toggle_pi_holes),
        contexts: ['page'],
        onclick: () => {
          BackgroundService.togglePiHole()
        },
      },
      {
        type: 'separator',
        contexts: ['page'],
      },
      {
        title: I18NService.translate(
          I18NContextMenuKeys.blacklist_current_domain,
        ),
        contexts: ['page'],
        onclick: () => {
          BackgroundService.blacklistCurrentDomain()
        },
      },
      {
        title: I18NService.translate(
          I18NContextMenuKeys.whitelist_current_domain,
        ),
        contexts: ['page'],
        onclick: () => {
          BackgroundService.whitelistCurrentDomain()
        },
      },
      {
        type: 'separator',
        contexts: ['page'],
      },
      {
        title: I18NService.translate(I18NContextMenuKeys.open_settings),
        contexts: ['page'],
        onclick: () => BackgroundService.openOptions(),
      },
    ]
  }

  init(): void {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      const configuration = this.contextMenusConfigurations.find(
        (_value, index) => String(index) === String(info.menuItemId),
      )
      configuration?.onclick?.(info, tab!)
    })

    StorageService.getDisableContextMenu().then((value) => {
      this.removeOrCreateContextMenuByBoolean(value).catch((reason) => {
        console.error('Failed to initialize context menus', reason)
      })
    })
    chrome.storage.onChanged.addListener((changes, areaName) => {
      const change = changes[ExtensionStorageEnum.disable_context_menu]
      if (areaName !== 'local' || !change) {
        return
      }
      this.removeOrCreateContextMenuByBoolean(Boolean(change.newValue)).catch(
        (reason) => {
          console.error('Failed to update context menus', reason)
        },
      )
    })
  }

  private async removeOrCreateContextMenuByBoolean(
    state: boolean,
  ): Promise<void> {
    const requestId = ++this.updateRequestId
    await new Promise<void>((resolve) => {
      chrome.contextMenus.removeAll(() => {
        void chrome.runtime.lastError
        resolve()
      })
    })
    if (!state && requestId === this.updateRequestId) {
      this.createContextMenu()
    }
  }

  private createContextMenu(): void {
    for (const [idx, contextMenusConfiguration] of Object.entries(
      this.contextMenusConfigurations,
    )) {
      chrome.contextMenus.create({
        ...contextMenusConfiguration,
        id: idx,
        onclick: undefined,
      })
    }
  }
}
