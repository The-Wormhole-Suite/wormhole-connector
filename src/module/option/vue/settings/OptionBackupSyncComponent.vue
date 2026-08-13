<template>
  <v-card>
    <v-card-title>
      {{ translate(I18NOptionKeys.options_backup_sync_title) }}
    </v-card-title>
    <v-card-text>
      <v-alert class="mb-4" type="info" variant="outlined">
        {{ translate(I18NOptionKeys.options_backup_secrets_excluded) }}
      </v-alert>

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn color="primary" variant="outlined" @click="exportSettings">
          {{ translate(I18NOptionKeys.options_backup_export) }}
        </v-btn>
        <v-btn variant="outlined" @click="openImportPicker">
          {{ translate(I18NOptionKeys.options_backup_import) }}
        </v-btn>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="application/json,.json"
          @change="readImportFile"
        />
      </div>

      <v-alert
        v-if="transferError"
        class="mb-4"
        type="error"
        variant="outlined"
      >
        {{ translate(I18NOptionKeys.options_backup_invalid) }}
        <div class="technical-detail">{{ transferError }}</div>
      </v-alert>

      <v-card
        v-if="pendingImport"
        class="mb-5"
        variant="outlined"
        color="primary"
      >
        <v-card-title class="text-subtitle-1">
          {{ translate(I18NOptionKeys.options_backup_preview_title) }}
        </v-card-title>
        <v-card-text>
          <ul class="preview-list">
            <li>
              {{ translate(I18NOptionKeys.options_backup_preview_date) }}:
              {{ formatExportDate(pendingImport.backup.exportedAt) }}
            </li>
            <li>
              {{ translate(I18NOptionKeys.options_backup_preview_addresses) }}:
              {{ pendingImport.backup.settings.addresses.connectors.length }}
            </li>
            <li>
              {{ translate(I18NOptionKeys.options_backup_preview_categories) }}:
              4
            </li>
          </ul>
          <v-alert class="mt-3" type="warning" variant="tonal">
            {{ translate(I18NOptionKeys.options_backup_password_notice) }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" :loading="importApplying" @click="applyImport">
            {{ translate(I18NOptionKeys.options_backup_apply) }}
          </v-btn>
          <v-btn :disabled="importApplying" @click="cancelImport">
            {{ translate(I18NOptionKeys.options_backup_cancel) }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-divider class="mb-4" />

      <h3 class="text-subtitle-1 mb-2">
        {{ translate(I18NOptionKeys.options_sync_title) }}
      </h3>
      <p class="mb-3">
        {{ translate(I18NOptionKeys.options_sync_description) }}
      </p>

      <v-switch
        v-for="category in syncCategories"
        :key="category"
        :model-value="syncPreferences[category]"
        :label="translate(syncLabels[category])"
        :loading="syncCategoryLoading === category"
        :disabled="syncCategoryLoading !== null || syncNowLoading"
        inset
        @update:model-value="setSyncCategory(category, Boolean($event))"
      />

      <v-btn
        class="mt-2"
        variant="outlined"
        :loading="syncNowLoading"
        :disabled="!hasEnabledSyncCategory || syncCategoryLoading !== null"
        @click="syncNow"
      >
        {{ translate(I18NOptionKeys.options_sync_now) }}
      </v-btn>

      <v-alert
        v-if="syncState === 'success'"
        class="mt-3"
        type="success"
        variant="outlined"
      >
        {{ translate(I18NOptionKeys.options_sync_success) }}
      </v-alert>
      <v-alert
        v-if="syncState === 'error'"
        class="mt-3"
        type="error"
        variant="outlined"
      >
        {{ translate(I18NOptionKeys.options_sync_error) }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue'
import useTranslation from '../../../../hooks/translation'
import BrowserSyncService, {
  SYNC_CATEGORIES,
} from '../../../../service/BrowserSyncService'
import PiHoleApiService from '../../../../service/PiHoleApiService'
import {
  createImportPlan,
  createSettingsBackup,
  parseSettingsBackup,
  type ImportPlan,
} from '../../../../service/SettingsTransferService'
import {
  ConnectorType,
  getConnectorType,
  StorageService,
  SyncPreferenceDefaults,
  type SyncCategory,
  type SyncPreferences,
} from '../../../../service/StorageService'
import { I18NOptionKeys } from '../../../../service/i18NService'

export default defineComponent({
  name: 'OptionBackupSyncComponent',
  setup: () => {
    const { translate } = useTranslation()
    const fileInput = ref<HTMLInputElement | null>(null)
    const pendingImport = ref<ImportPlan | null>(null)
    const transferError = ref('')
    const importApplying = ref(false)
    const syncPreferences = ref<SyncPreferences>({
      ...SyncPreferenceDefaults,
    })
    const syncCategoryLoading = ref<SyncCategory | null>(null)
    const syncNowLoading = ref(false)
    const syncState = ref<'success' | 'error' | null>(null)
    const syncCategories = [...SYNC_CATEGORIES]
    const syncLabels: Record<SyncCategory, I18NOptionKeys> = {
      general: I18NOptionKeys.options_sync_general,
      timers: I18NOptionKeys.options_sync_timers,
      group: I18NOptionKeys.options_sync_group,
      addresses: I18NOptionKeys.options_sync_addresses,
    }

    const hasEnabledSyncCategory = computed(() =>
      syncCategories.some((category) => syncPreferences.value[category]),
    )

    const exportSettings = async () => {
      transferError.value = ''
      try {
        const backup = createSettingsBackup(
          await StorageService.getAllLocalValues(),
        )
        const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `wormhole-connector-settings-${backup.exportedAt.slice(0, 10)}.json`
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } catch (reason) {
        transferError.value = getErrorMessage(reason)
      }
    }

    const openImportPicker = () => {
      transferError.value = ''
      fileInput.value?.click()
    }

    const readImportFile = async (event: Event) => {
      transferError.value = ''
      pendingImport.value = null
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = ''
      if (!file) {
        return
      }

      try {
        if (file.size > 1024 * 1024) {
          throw new Error('Backup file exceeds 1 MiB')
        }
        const backup = parseSettingsBackup(JSON.parse(await file.text()))
        const currentConnections =
          (await StorageService.getPiHoleSettingsArray()) ?? []
        pendingImport.value = createImportPlan(backup, currentConnections)
      } catch (reason) {
        transferError.value = getErrorMessage(reason)
      }
    }

    const applyImport = async () => {
      if (!pendingImport.value) {
        return
      }

      importApplying.value = true
      transferError.value = ''
      try {
        const currentConnections =
          (await StorageService.getPiHoleSettingsArray()) ?? []
        await PiHoleApiService.endSessions(
          currentConnections.filter(
            (connection) =>
              getConnectorType(connection) === ConnectorType.piHole,
          ),
        )
        await StorageService.removeAllSids()
        await StorageService.setLocalValues(pendingImport.value.set)
        await StorageService.removeLocalValues(pendingImport.value.remove)
        pendingImport.value = null
        window.location.reload()
      } catch (reason) {
        transferError.value = getErrorMessage(reason)
      } finally {
        importApplying.value = false
      }
    }

    const cancelImport = () => {
      pendingImport.value = null
      transferError.value = ''
    }

    const setSyncCategory = async (
      category: SyncCategory,
      enabled: boolean,
    ) => {
      const previous = syncPreferences.value[category]
      syncPreferences.value[category] = enabled
      syncCategoryLoading.value = category
      syncState.value = null
      try {
        syncPreferences.value = await BrowserSyncService.setCategoryEnabled(
          category,
          enabled,
        )
        syncState.value = 'success'
      } catch (reason) {
        console.warn(reason)
        syncPreferences.value[category] = previous
        syncState.value = 'error'
      } finally {
        syncCategoryLoading.value = null
      }
    }

    const syncNow = async () => {
      syncNowLoading.value = true
      syncState.value = null
      try {
        await BrowserSyncService.syncNow()
        syncState.value = 'success'
      } catch (reason) {
        console.warn(reason)
        syncState.value = 'error'
      } finally {
        syncNowLoading.value = false
      }
    }

    const formatExportDate = (value: string) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))

    onMounted(async () => {
      syncPreferences.value = await StorageService.getSyncPreferences()
    })

    return {
      fileInput,
      pendingImport,
      transferError,
      importApplying,
      syncPreferences,
      syncCategoryLoading,
      syncNowLoading,
      syncState,
      syncCategories,
      syncLabels,
      hasEnabledSyncCategory,
      exportSettings,
      openImportPicker,
      readImportFile,
      applyImport,
      cancelImport,
      setSyncCategory,
      syncNow,
      formatExportDate,
      translate,
      I18NOptionKeys,
    }
  },
})

const getErrorMessage = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason)
</script>

<style scoped>
.file-input {
  display: none;
}

.preview-list {
  margin: 0;
  padding-inline-start: 20px;
}

.technical-detail {
  margin-top: 4px;
  font-family: monospace;
  font-size: 11px;
}
</style>
