<template>
  <section class="popup-section group-control">
    <div class="control-row">
      <span class="control-label">{{
        translate(I18NPopupKeys.popup_group_manual)
      }}</span>
      <v-switch
        class="control-switch"
        :model-value="groupBlockingActive"
        :indeterminate="groupMixed"
        color="green"
        density="compact"
        hide-details
        size="small"
        :loading="groupActionLoading && groupTimedActionLoading === null"
        :disabled="
          groupSwitchDisabled ||
          groupActionLoading ||
          groupsLoading ||
          !selectedGroup
        "
        @update:model-value="changeGroupState"
      ></v-switch>
    </div>

    <div v-if="groupMixed" class="inline-warning">
      {{ translate(I18NPopupKeys.popup_group_mixed) }}
    </div>

    <div class="timer-label">
      {{ translate(I18NPopupKeys.popup_group_pause_times_title) }}
    </div>
    <div class="timer-row">
      <v-btn
        v-for="(time, index) in groupPauseTimes"
        :key="`group-pause-${index}`"
        class="timer-button"
        color="orange-darken-2"
        size="small"
        variant="flat"
        :disabled="groupActionLoading || groupsLoading || !selectedGroup"
        :loading="groupTimedActionLoading === index"
        @click="pauseGroupFor(time, index)"
      >
        <v-icon size="16" start>{{ mdiTimerOutline }}</v-icon>
        {{ time }} s
      </v-btn>
    </div>

    <div
      v-if="groupActionState === 'error' || groupLoadError"
      class="inline-error"
    >
      {{ translate(I18NPopupKeys.popup_group_error) }}
    </div>
    <ul v-if="failureDetails.length > 0" class="failure-details">
      <li v-for="detail in failureDetails" :key="detail">{{ detail }}</li>
    </ul>
  </section>
</template>

<script lang="ts">
import { mdiTimerOutline } from '@mdi/js'
import { defineComponent, onMounted, ref, watch, type PropType } from 'vue'
import {
  GroupPauseTimeDefaults,
  StorageService,
} from '../../../../service/StorageService'
import TabService from '../../../../service/TabService'
import useTranslation from '../../../../hooks/translation'
import ConnectorScopePauseService from '../../../../service/ConnectorScopePauseService'
import DomainStatusService from '../../../../service/DomainStatusService'
import { getOperationFailureDetails } from '../../../../service/MultiInstanceOperation'

export default defineComponent({
  name: 'PopupStatusCardComponent',
  props: {
    selectedGroup: {
      type: String as PropType<string | null>,
      default: null,
    },
    groupsLoading: {
      type: Boolean,
      default: false,
    },
    groupLoadError: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['group-state-change'],
  setup: (props, { emit }) => {
    const { translate, I18NPopupKeys } = useTranslation()
    const groupPauseTimes = ref<number[]>([...GroupPauseTimeDefaults])
    const groupBlockingActive = ref<boolean | null>(true)
    const groupMixed = ref(false)
    const groupSwitchDisabled = ref(true)
    const groupActionLoading = ref(false)
    const groupTimedActionLoading = ref<number | null>(null)
    const groupActionState = ref<'success' | 'error' | null>(null)
    const failureDetails = ref<string[]>([])

    const updateSelectedGroupStatus = async () => {
      if (!props.selectedGroup) {
        groupSwitchDisabled.value = true
        return
      }

      groupSwitchDisabled.value = true
      try {
        const state = await ConnectorScopePauseService.getScopeState(
          props.selectedGroup,
        )
        groupMixed.value = state === 'mixed'
        groupBlockingActive.value = groupMixed.value ? null : state === 'active'
        groupSwitchDisabled.value = false
      } catch (reason) {
        console.warn(reason)
        groupBlockingActive.value = false
        groupMixed.value = false
        groupActionState.value = 'error'
      }
    }

    const loadGroupPauseTimes = async () => {
      const storedTimes = await StorageService.getGroupPauseTimes()
      if (storedTimes?.length === 3) {
        groupPauseTimes.value = storedTimes
      }
    }

    const reloadAfterPause = async () => {
      if (await StorageService.getReloadAfterDisable()) {
        TabService.reloadCurrentTab(1000)
      }
    }

    const changeGroupState = async (blockingEnabled: boolean | null) => {
      if (typeof blockingEnabled !== 'boolean' || !props.selectedGroup) {
        return
      }

      groupActionLoading.value = true
      groupTimedActionLoading.value = null
      groupActionState.value = null
      failureDetails.value = []
      groupSwitchDisabled.value = true
      try {
        if (blockingEnabled) {
          await ConnectorScopePauseService.resumeScope(props.selectedGroup)
        } else {
          await ConnectorScopePauseService.pauseScope(props.selectedGroup, 0)
        }

        groupBlockingActive.value = blockingEnabled
        groupMixed.value = false
        await DomainStatusService.refreshCurrentTabBadge()
        emit('group-state-change')
        if (!blockingEnabled) {
          await reloadAfterPause()
        }
      } catch (reason) {
        console.warn(reason)
        groupActionState.value = 'error'
        failureDetails.value = getOperationFailureDetails(reason)
        await updateSelectedGroupStatus()
      } finally {
        groupActionLoading.value = false
        groupSwitchDisabled.value = props.groupLoadError
      }
    }

    const pauseGroupFor = async (
      durationSeconds: number,
      timerIndex: number,
    ) => {
      if (!props.selectedGroup || durationSeconds < 1) {
        return
      }

      groupActionLoading.value = true
      groupTimedActionLoading.value = timerIndex
      groupActionState.value = null
      failureDetails.value = []
      groupSwitchDisabled.value = true
      try {
        await ConnectorScopePauseService.pauseScope(
          props.selectedGroup,
          durationSeconds,
        )
        groupBlockingActive.value = false
        groupMixed.value = false
        await DomainStatusService.refreshCurrentTabBadge()
        emit('group-state-change')
        await reloadAfterPause()
      } catch (reason) {
        console.warn(reason)
        groupActionState.value = 'error'
        failureDetails.value = getOperationFailureDetails(reason)
        await updateSelectedGroupStatus()
      } finally {
        groupTimedActionLoading.value = null
        groupActionLoading.value = false
        groupSwitchDisabled.value = props.groupLoadError
      }
    }

    watch(
      () => props.selectedGroup,
      async () => {
        groupActionState.value = null
        await updateSelectedGroupStatus()
      },
    )

    onMounted(async () => {
      await loadGroupPauseTimes()
      await updateSelectedGroupStatus()
    })

    return {
      mdiTimerOutline,
      groupPauseTimes,
      groupBlockingActive,
      groupMixed,
      groupSwitchDisabled,
      groupActionLoading,
      groupTimedActionLoading,
      groupActionState,
      failureDetails,
      changeGroupState,
      pauseGroupFor,
      translate,
      I18NPopupKeys,
    }
  },
})
</script>

<style scoped lang="scss">
.popup-section {
  padding: 2px 0 4px;
}

.control-row {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.control-label,
.timer-label {
  font-size: 12px;
  line-height: 1.3;
}

.control-label {
  font-weight: 500;
}

.control-switch {
  flex: 0 0 auto;
  margin-inline-end: -2px;
}

.control-switch :deep(.v-selection-control) {
  min-height: 32px;
}

.timer-label {
  margin: 3px 0 6px;
  font-weight: 600;
}

.timer-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.timer-button {
  min-width: 0;
  padding-inline: 5px;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

.inline-error {
  margin-top: 6px;
  color: rgb(var(--v-theme-error));
  font-size: 11px;
  line-height: 1.3;
}

.inline-warning {
  margin: 2px 0 4px;
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
