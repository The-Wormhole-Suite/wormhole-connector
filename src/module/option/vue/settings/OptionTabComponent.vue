<template>
  <div>
    <v-tabs v-model="currentTab">
      <v-tab
        v-for="(_, index) in tabs"
        :key="`dyn-tab-${index}`"
        :value="index"
        @click="resetConnectionCheckAndCheck"
      >
        {{ connectorName(tabs[index]) }} {{ index + 1 }}
      </v-tab>
    </v-tabs>
    <v-window v-model="currentTab">
      <v-window-item
        v-for="(pi_hole_setting, index) in tabs"
        :key="index"
        :value="index"
        class="mt-5"
      >
        <v-select
          v-model="pi_hole_setting.connector_type"
          :items="connectorTypes"
          :label="translate(I18NOptionKeys.options_connector_type)"
          variant="outlined"
          @update:model-value="connectorTypeChanged"
        ></v-select>
        <v-text-field
          v-model="pi_hole_setting.pi_uri_base"
          v-debounce:500ms="connectionCheck"
          variant="outlined"
          debounce-events="input"
          :placeholder="addressPlaceholder(pi_hole_setting)"
          :rules="[
            (v) =>
              isValidUrlSchema(v, pi_hole_setting) ||
              translate(I18NOptionKeys.options_url_invalid_warning),
          ]"
          :label="translate(I18NOptionKeys.options_connector_address)"
          required
          @update:model-value="markDirty"
        ></v-text-field>
        <v-text-field
          v-if="getConnectorType(pi_hole_setting) === ConnectorType.adguardHome"
          v-model="pi_hole_setting.username"
          v-debounce:500ms="connectionCheck"
          variant="outlined"
          debounce-events="input"
          :label="translate(I18NOptionKeys.options_username)"
          required
          @update:model-value="markDirty"
        ></v-text-field>
        <v-text-field
          v-model="pi_hole_setting.api_key"
          v-debounce:500ms="connectionCheck"
          variant="outlined"
          :type="passwordInputType"
          :append-inner-icon="
            passwordInputType === 'password' ? mdiEyeOutline : mdiEyeOffOutline
          "
          :label="translate(I18NOptionKeys.options_password)"
          @click:append-inner="toggleApiKeyVisibility"
          @update:model-value="markDirty"
        ></v-text-field>

        <div class="mb-5 d-flex flex-wrap ga-2">
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!canSave || saving"
            @click.prevent="saveSettings"
          >
            {{ translate(I18NOptionKeys.options_save_button) }}
          </v-btn>
          <v-btn v-if="tabs.length < 4" @click.prevent="addNewPiHole">
            {{ translate(I18NOptionKeys.options_add_button) }}
          </v-btn>
          <v-btn
            v-if="tabs.length > 1"
            @click.prevent="removePiHole(currentTab)"
          >
            {{
              translate(I18NOptionKeys.options_remove_button, [
                String(currentTab + 1),
              ])
            }}
          </v-btn>
        </div>

        <v-alert
          v-if="saveState === 'success'"
          class="mb-4"
          type="success"
          variant="outlined"
        >
          {{ translate(I18NOptionKeys.options_save_success) }}
        </v-alert>
        <v-alert
          v-if="saveState === 'error'"
          class="mb-4"
          type="error"
          variant="outlined"
        >
          {{ translate(I18NOptionKeys.options_save_error) }}
        </v-alert>

        <v-alert v-if="tabs.length > 1" type="info" variant="outlined">
          {{ translate(I18NOptionKeys.option_multiple_connections) }}
        </v-alert>
        <v-alert
          v-if="connectionCheckStatus === 'IDLE'"
          variant="outlined"
          type="info"
        >
          {{ translate(I18NOptionKeys.option_connection_check_idle) }}
          <v-progress-circular
            color="primary"
            indeterminate
            :size="25"
            :width="2"
          />
        </v-alert>
        <v-alert
          v-if="connectionCheckStatus === 'OK'"
          type="success"
          variant="outlined"
        >
          {{ translate(I18NOptionKeys.option_connection_check_ok) }}<br />
          {{ connectionCheckVersionText }}
        </v-alert>
        <v-alert
          v-if="connectionCheckStatus === 'ERROR'"
          variant="outlined"
          type="error"
        >
          {{ translate(I18NOptionKeys.option_connection_check_error) }}
          <div v-if="connectionCheckError" class="connection-error-detail">
            {{ connectionCheckError }}
          </div>
        </v-alert>
        <v-alert
          v-if="
            connectionCheckStatus === 'OK' &&
            connectionCheckData !== null &&
            connectionUpdateAvailable
          "
          variant="outlined"
          type="info"
        >
          {{
            translate(I18NOptionKeys.option_connection_check_update_available)
          }}
        </v-alert>
      </v-window-item>
    </v-window>
  </div>
</template>

<script lang="ts">
import { debounce } from 'vue-debounce'
import { computed, defineComponent, onMounted, ref, watch } from 'vue'
import { mdiEyeOffOutline, mdiEyeOutline } from '@mdi/js'
import {
  AdGuardHomeSettingsDefaults,
  ConnectorType,
  getConnectorType,
  PiHoleSettingsDefaults,
  ConnectorSettingsStorage,
  StorageService,
} from '../../../../service/StorageService'
import PiHoleApiService from '../../../../service/PiHoleApiService'
import ConnectorApiService, {
  type ConnectorVersionInfo,
} from '../../../../service/ConnectorApiService'
import useTranslation from '../../../../hooks/translation'
import {
  isValidConnectorAddress,
  normalizeConnectorAddress,
} from '../../../../service/ConnectorUrl'

enum ConnectionCheckStatus {
  OK = 'OK',
  ERROR = 'ERROR',
  IDLE = 'IDLE',
}

enum PasswordInputType {
  password = 'password',
  text = 'text',
}

type SaveState = 'success' | 'error' | null

export default defineComponent({
  name: 'OptionTabComponent',
  setup: () => {
    const tabs = ref<ConnectorSettingsStorage[]>([
      {
        connector_type: ConnectorType.piHole,
        pi_uri_base: '',
        api_key: '',
        username: '',
      },
    ])
    const currentTab = ref(0)
    const passwordInputType = ref<PasswordInputType>(PasswordInputType.password)
    const connectionCheckStatus = ref<ConnectionCheckStatus>(
      ConnectionCheckStatus.IDLE,
    )
    const connectionCheckData = ref<ConnectorVersionInfo | null>(null)
    const connectionCheckError = ref('')
    const saving = ref(false)
    const saveState = ref<SaveState>(null)
    const settingsDirty = ref(false)
    let connectionCheckRequestId = 0

    const connectorTypes = [
      { title: 'Pi-hole', value: ConnectorType.piHole },
      { title: 'AdGuard Home', value: ConnectorType.adguardHome },
    ]

    const currentSelectedSettings = computed(() => tabs.value[currentTab.value])

    const normalizeSettings = (): ConnectorSettingsStorage[] =>
      tabs.value.map((setting) => ({
        connector_type: getConnectorType(setting),
        pi_uri_base: normalizeConnectorAddress(setting),
        api_key: String(setting.api_key ?? ''),
        username:
          getConnectorType(setting) === ConnectorType.adguardHome
            ? String(setting.username ?? '')
            : undefined,
      }))

    const isValidUrlSchema = (
      address: string,
      setting: ConnectorSettingsStorage = currentSelectedSettings.value,
    ) =>
      isValidConnectorAddress({
        connector_type: getConnectorType(setting),
        pi_uri_base: String(address ?? ''),
      })

    const canSave = computed(() => {
      return (
        tabs.value.length > 0 &&
        tabs.value.every(
          (setting) =>
            isValidConnectorAddress(setting) &&
            (getConnectorType(setting) !== ConnectorType.adguardHome ||
              Boolean(setting.username)),
        )
      )
    })

    const connectionCheck = async () => {
      const requestId = ++connectionCheckRequestId
      const tabIndex = currentTab.value
      const settings = { ...currentSelectedSettings.value }
      connectionCheckStatus.value = ConnectionCheckStatus.IDLE
      connectionCheckData.value = null
      connectionCheckError.value = ''

      try {
        const result = await ConnectorApiService.testConnection(settings)
        if (
          requestId !== connectionCheckRequestId ||
          tabIndex !== currentTab.value
        ) {
          return
        }
        if (typeof result === 'object') {
          connectionCheckStatus.value = ConnectionCheckStatus.OK
          connectionCheckData.value = result
        } else {
          connectionCheckStatus.value = ConnectionCheckStatus.ERROR
        }
      } catch (reason) {
        if (
          requestId === connectionCheckRequestId &&
          tabIndex === currentTab.value
        ) {
          connectionCheckStatus.value = ConnectionCheckStatus.ERROR
          connectionCheckError.value =
            reason instanceof Error ? reason.message : String(reason)
        }
      }
    }

    const resetConnectionCheckAndCheck = () => {
      connectionCheckRequestId += 1
      connectionCheckStatus.value = ConnectionCheckStatus.IDLE
      connectionCheckData.value = null
      connectionCheckError.value = ''
      debounce(() => {
        connectionCheck()
      }, '300ms')()
    }

    const updateTabsSettings = async () => {
      const results = await StorageService.getPiHoleSettingsArray()
      if (typeof results !== 'undefined' && results.length > 0) {
        tabs.value = results.map((setting) => ({
          ...setting,
          connector_type: getConnectorType(setting),
          username: String(setting.username ?? ''),
        }))
      }
      settingsDirty.value = false
    }

    const markDirty = () => {
      // Invalidate a request immediately. Waiting for the debounced follow-up
      // would otherwise let an older response overwrite the edited values.
      connectionCheckRequestId += 1
      settingsDirty.value = true
      saveState.value = null
    }

    const saveSettings = async () => {
      if (!canSave.value) {
        saveState.value = 'error'
        return
      }

      saving.value = true
      saveState.value = null
      try {
        const normalizedSettings = normalizeSettings()
        const previousSettings =
          (await StorageService.getPiHoleSettingsArray()) ?? []
        await PiHoleApiService.endSessions(
          previousSettings.filter(
            (setting) => getConnectorType(setting) === ConnectorType.piHole,
          ),
        )
        await StorageService.saveConnectorSettingsArray(normalizedSettings)
        tabs.value = normalizedSettings
        settingsDirty.value = false
        saveState.value = 'success'
        resetConnectionCheckAndCheck()
      } catch (reason) {
        console.warn(reason)
        saveState.value = 'error'
      } finally {
        saving.value = false
      }
    }

    onMounted(() => {
      updateTabsSettings().then(() => resetConnectionCheckAndCheck())
    })

    watch(currentTab, () => {
      passwordInputType.value = PasswordInputType.password
      saveState.value = null
    })

    const connectionCheckVersionText = computed(() => {
      const data = connectionCheckData.value
      return data ? `${data.product}: ${data.version}` : ''
    })

    const connectionUpdateAvailable = computed(
      () => connectionCheckData.value?.updateAvailable === true,
    )

    const toggleApiKeyVisibility = () => {
      if (passwordInputType.value === PasswordInputType.password) {
        passwordInputType.value = PasswordInputType.text
      } else {
        passwordInputType.value = PasswordInputType.password
      }
    }

    const addNewPiHole = () => {
      tabs.value.push({
        connector_type: ConnectorType.piHole,
        pi_uri_base: '',
        api_key: '',
        username: '',
      })
      currentTab.value = tabs.value.length - 1
      connectionCheckStatus.value = ConnectionCheckStatus.IDLE
      connectionCheckData.value = null
      connectionCheckError.value = ''
      markDirty()
    }

    const removePiHole = (index: number) => {
      tabs.value.splice(index, 1)
      currentTab.value = Math.min(index, tabs.value.length - 1)
      markDirty()
      resetConnectionCheckAndCheck()
    }

    const connectorName = (setting: ConnectorSettingsStorage) =>
      getConnectorType(setting) === ConnectorType.adguardHome
        ? 'AdGuard Home'
        : 'Pi-hole'

    const addressPlaceholder = (setting: ConnectorSettingsStorage) =>
      getConnectorType(setting) === ConnectorType.adguardHome
        ? AdGuardHomeSettingsDefaults.address
        : String(PiHoleSettingsDefaults.pi_uri_base)

    const connectorTypeChanged = () => {
      markDirty()
      resetConnectionCheckAndCheck()
    }

    return {
      ConnectorType,
      getConnectorType,
      connectorTypes,
      connectorName,
      addressPlaceholder,
      connectorTypeChanged,
      mdiEyeOutline,
      mdiEyeOffOutline,
      currentTab,
      tabs,
      passwordInputType,
      connectionCheck,
      resetConnectionCheckAndCheck,
      isValidUrlSchema,
      removePiHole,
      addNewPiHole,
      toggleApiKeyVisibility,
      connectionCheckVersionText,
      connectionCheckStatus,
      connectionCheckData,
      connectionCheckError,
      connectionUpdateAvailable,
      canSave,
      saving,
      saveState,
      settingsDirty,
      saveSettings,
      markDirty,
      ...useTranslation(),
    }
  },
})
</script>

<style scoped>
.connection-error-detail {
  margin-top: 4px;
  font-family: monospace;
  font-size: 11px;
}
</style>
