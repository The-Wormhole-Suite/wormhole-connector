<template>
  <div class="wormhole-view settings-view">
    <header class="page-header">
      <div>
        <div class="eyebrow">CONTROL INTERFACE</div>
        <h1>{{ translate(I18NOptionKeys.options_settings) }}</h1>
        <p>{{ translate(I18NOptionKeys.options_headline_additional_info) }}</p>
      </div>
      <div class="header-status glass-chip">
        <span class="status-dot"></span>
        <div>
          <strong>Wormhole Connector</strong>
          <span>v{{ extensionVersion }}</span>
        </div>
      </div>
    </header>

    <v-card class="card glass-panel connection-card">
      <div class="card-heading">
        <div>
          <span class="section-index">01</span>
          <h2>{{ translate(I18NOptionKeys.options_headline_info) }}</h2>
          <p>
            {{ translate(I18NOptionKeys.options_headline_additional_info) }}
          </p>
        </div>
      </div>
      <OptionTabComponent />
    </v-card>

    <OptionDisableTimeComponent />

    <v-card class="card glass-panel behavior-card">
      <div class="card-heading card-heading--compact">
        <div>
          <span class="section-index">04</span>
          <h2>
            {{ translate(I18NOptionKeys.option_settings_general_settings) }}
          </h2>
          <p>Automatisierung und Integrationen des Connectors.</p>
        </div>
      </div>

      <div class="behavior-grid">
        <OptionCheckboxComponent
          v-for="(item, i) in checkboxOptions"
          :key="i"
          :getter-function="item.getterFunction"
          :label-text-key="item.labelTextKey"
          :setter-function="item.setterFunction"
        />
      </div>

      <v-btn v-if="!isFirefox" class="mt-5" @click="openHotKeySettings">
        {{ translate(I18NOptionKeys.option_hotkey_settings) }}
      </v-btn>
    </v-card>

    <div class="backup-section">
      <div class="card-heading card-heading--compact backup-heading">
        <div>
          <span class="section-index">05</span>
          <h2>{{ translate(I18NOptionKeys.options_backup_sync_title) }}</h2>
        </div>
      </div>
      <OptionBackupSyncComponent />
    </div>

    <footer class="page-footer">
      <span>Wormhole Connector</span>
      <span class="footer-line"></span>
      <span>Domains demystified</span>
    </footer>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import { I18NOptionKeys } from '../../../../service/i18NService'
import { StorageService } from '../../../../service/StorageService'
import useTranslation from '../../../../hooks/translation'
import OptionCheckboxComponent from '../settings/OptionCheckboxComponent.vue'
import OptionTabComponent from '../settings/OptionTabComponent.vue'
import OptionDisableTimeComponent from '../settings/OptionDisableTimeComponent.vue'
import OptionBackupSyncComponent from '../settings/OptionBackupSyncComponent.vue'

export default defineComponent({
  name: 'OptionSettingsView',
  components: {
    OptionDisableTimeComponent,
    OptionTabComponent,
    OptionCheckboxComponent,
    OptionBackupSyncComponent,
  },
  setup: () => {
    const { translate } = useTranslation()
    const extensionVersion = computed(
      () => chrome.runtime.getManifest().version,
    )

    const checkboxOptions: GenericCheckboxComponent[] = [
      {
        labelTextKey: I18NOptionKeys.options_reload_after_disable,
        getterFunction: () => StorageService.getReloadAfterDisable(),
        setterFunction: (value: boolean) =>
          StorageService.saveReloadAfterDisable(value),
      },
      {
        labelTextKey: I18NOptionKeys.options_reload_after_white_list,
        getterFunction: () => StorageService.getReloadAfterWhitelist(),
        setterFunction: (value: boolean) =>
          StorageService.saveReloadAfterWhitelist(value),
      },
      {
        labelTextKey: I18NOptionKeys.option_disable_feature,
        getterFunction: () => StorageService.getDisableListFeature(),
        setterFunction: (value: boolean) =>
          StorageService.saveDisableListFeature(value),
      },
      {
        labelTextKey: I18NOptionKeys.option_disable_context_menu,
        getterFunction: () => StorageService.getDisableContextMenu(),
        setterFunction: (value: boolean) =>
          StorageService.saveDisableContextMenu(value),
      },
    ]

    const isFirefox = computed(() => typeof browser !== 'undefined')

    const openHotKeySettings = () => {
      chrome.tabs.create({
        url: 'chrome://extensions/shortcuts',
      })
    }

    return {
      extensionVersion,
      openHotKeySettings,
      isFirefox,
      checkboxOptions,
      translate,
      I18NOptionKeys,
    }
  },
})

interface GenericCheckboxComponent {
  labelTextKey: I18NOptionKeys
  getterFunction: () => Promise<boolean | undefined> | Promise<boolean>
  setterFunction: (value: boolean) => void | Promise<void>
}
</script>
