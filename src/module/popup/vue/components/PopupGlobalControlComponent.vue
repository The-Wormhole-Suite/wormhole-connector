<template>
  <section class="popup-section global-control">
    <div class="control-row">
      <span class="control-label">{{
        translate(I18NPopupKeys.popup_global_title)
      }}</span>
      <v-switch
        class="control-switch"
        :model-value="blockingActive"
        :indeterminate="mixed"
        color="green"
        density="compact"
        hide-details
        size="small"
        :loading="loading"
        :disabled="disabled || loading"
        @update:model-value="changeGlobalState"
      ></v-switch>
    </div>
    <div v-if="error" class="inline-error">
      {{ translate(I18NPopupKeys.popup_global_error) }}
    </div>
    <div v-else-if="mixed" class="inline-warning">
      {{ translate(I18NPopupKeys.popup_global_mixed) }}
    </div>
    <ul v-if="failureDetails.length > 0" class="failure-details">
      <li v-for="detail in failureDetails" :key="detail">{{ detail }}</li>
    </ul>
  </section>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import PiHoleApiStatusEnum from '../../../../api/enum/PiHoleApiStatusEnum'
import useTranslation from '../../../../hooks/translation'
import { BadgeService } from '../../../../service/BadgeService'
import DomainStatusService from '../../../../service/DomainStatusService'
import ConnectorApiService from '../../../../service/ConnectorApiService'
import { StorageService } from '../../../../service/StorageService'
import TabService from '../../../../service/TabService'
import { getOperationFailureDetails } from '../../../../service/MultiInstanceOperation'

export default defineComponent({
  name: 'PopupGlobalControlComponent',
  emits: ['icon-state-change'],
  setup: (_props, { emit }) => {
    const { translate, I18NPopupKeys } = useTranslation()
    const blockingActive = ref<boolean | null>(false)
    const disabled = ref(true)
    const loading = ref(false)
    const error = ref(false)
    const mixed = ref(false)
    const failureDetails = ref<string[]>([])

    const refreshStatus = async () => {
      const status = await ConnectorApiService.getProtectionStatusCombined()
      BadgeService.setGlobalStatus(status)
      error.value = status === PiHoleApiStatusEnum.error
      mixed.value = status === PiHoleApiStatusEnum.mixed
      disabled.value = error.value
      blockingActive.value = mixed.value
        ? null
        : status === PiHoleApiStatusEnum.enabled
      await DomainStatusService.refreshActiveTabBadges()
      emit('icon-state-change')
    }

    const changeGlobalState = async (enabled: boolean | null) => {
      if (typeof enabled !== 'boolean') {
        return
      }

      loading.value = true
      disabled.value = true
      error.value = false
      mixed.value = false
      failureDetails.value = []
      try {
        const mode = enabled
          ? PiHoleApiStatusEnum.enabled
          : PiHoleApiStatusEnum.disabled
        const responses = await ConnectorApiService.changeProtection(mode, 0)
        if (responses.some((response) => response.blocking !== mode)) {
          throw new Error('One DNS connector returned an unexpected state')
        }

        blockingActive.value = enabled
        BadgeService.setGlobalStatus(mode)
        await DomainStatusService.refreshActiveTabBadges()
        emit('icon-state-change')
        if (!enabled && (await StorageService.getReloadAfterDisable())) {
          TabService.reloadCurrentTab(1000)
        }
      } catch (reason) {
        console.warn(reason)
        error.value = true
        failureDetails.value = getOperationFailureDetails(reason)
        await refreshStatus()
      } finally {
        loading.value = false
        disabled.value = error.value
      }
    }

    onMounted(refreshStatus)

    return {
      blockingActive,
      disabled,
      loading,
      error,
      mixed,
      failureDetails,
      changeGlobalState,
      translate,
      I18NPopupKeys,
    }
  },
})
</script>

<style scoped lang="scss">
.global-control {
  padding: 3px 0 6px;
}

.control-row {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.control-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.control-switch {
  flex: 0 0 auto;
  margin-inline-end: -2px;
}

.control-switch :deep(.v-selection-control) {
  min-height: 32px;
}

.inline-error {
  margin-top: 2px;
  color: rgb(var(--v-theme-error));
  font-size: 11px;
  line-height: 1.3;
}

.inline-warning {
  margin-top: 2px;
  color: rgb(var(--v-theme-warning));
  font-size: 11px;
  line-height: 1.3;
}

.failure-details {
  margin: 4px 0 0;
  padding-inline-start: 18px;
  font-size: 10px;
  line-height: 1.3;
}
</style>
