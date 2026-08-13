<template>
  <section class="popup-section domain-control">
    <div class="section-heading-row">
      <div>
        <div class="section-title">
          {{ translate(I18NPopupKeys.popup_second_card_current_url) }}
        </div>
        <div class="status-scope">
          {{ translate(I18NPopupKeys.popup_default_group_scope) }}
        </div>
      </div>
      <v-chip
        class="domain-status"
        :color="globalDomainStatusColor"
        size="x-small"
        variant="flat"
      >
        <v-progress-circular
          v-if="globalStatusLoading"
          class="mr-1"
          indeterminate
          size="11"
          width="2"
        ></v-progress-circular>
        {{ globalDomainStatusText }}
      </v-chip>
    </div>

    <div class="domain-display" :title="currentUrl">{{ currentUrl }}</div>

    <div v-if="!hideGlobalListActions" class="permanent-actions">
      <v-btn
        id="list_action_white"
        class="domain-action"
        color="green"
        size="small"
        variant="flat"
        :disabled="buttonsDisabled"
        :loading="globalActionLoading === ApiList.whitelist"
        @click="listDomain(ApiList.whitelist)"
      >
        <v-icon size="17" start>{{ mdiCheck }}</v-icon>
        {{ translate(I18NPopupKeys.popup_second_card_whitelist) }}
      </v-btn>
      <v-btn
        id="list_action_black"
        class="domain-action"
        color="red"
        size="small"
        variant="flat"
        :disabled="buttonsDisabled"
        :loading="globalActionLoading === ApiList.blacklist"
        @click="listDomain(ApiList.blacklist)"
      >
        <v-icon size="17" start>{{ mdiClose }}</v-icon>
        {{ translate(I18NPopupKeys.popup_second_card_blacklist) }}
      </v-btn>
    </div>

    <v-divider class="section-divider"></v-divider>

    <div class="section-heading-row">
      <div class="section-title">
        {{ translate(I18NPopupKeys.popup_group_title) }}
      </div>
      <v-chip
        class="domain-status"
        :color="groupDomainStatusColor"
        size="x-small"
        variant="flat"
      >
        <v-progress-circular
          v-if="groupStatusLoading"
          class="mr-1"
          indeterminate
          size="11"
          width="2"
        ></v-progress-circular>
        {{ groupDomainStatusText }}
      </v-chip>
    </div>

    <v-select
      v-if="!hideGroupSelector"
      v-model="selectedGroupModel"
      class="group-select"
      :items="groupItems"
      :label="translate(I18NPopupKeys.popup_group_select)"
      :loading="groupsLoading"
      :disabled="groupsLoading || groupItems.length === 0 || buttonsDisabled"
      variant="outlined"
      density="compact"
      hide-details
    ></v-select>

    <div v-if="!hideGroupListActions" class="permanent-actions group-actions">
      <v-btn
        id="group_list_action_white"
        class="domain-action"
        color="green"
        size="small"
        variant="flat"
        :disabled="buttonsDisabled || !selectedGroup"
        :loading="groupActionLoading === ApiList.whitelist"
        @click="listDomainForGroup(ApiList.whitelist)"
      >
        <v-icon size="17" start>{{ mdiCheck }}</v-icon>
        {{ translate(I18NPopupKeys.popup_second_card_whitelist) }}
      </v-btn>
      <v-btn
        id="group_list_action_black"
        class="domain-action"
        color="red"
        size="small"
        variant="flat"
        :disabled="buttonsDisabled || !selectedGroup"
        :loading="groupActionLoading === ApiList.blacklist"
        @click="listDomainForGroup(ApiList.blacklist)"
      >
        <v-icon size="17" start>{{ mdiClose }}</v-icon>
        {{ translate(I18NPopupKeys.popup_second_card_blacklist) }}
      </v-btn>
    </div>

    <div class="temporary-heading">
      {{ translate(I18NPopupKeys.popup_temporary_whitelist) }}
    </div>
    <div class="timer-row">
      <v-btn
        v-for="(time, index) in temporaryAllowTimes"
        :key="`temporary-${index}`"
        class="timer-button"
        color="orange-darken-2"
        size="small"
        variant="flat"
        :disabled="buttonsDisabled || !selectedGroup"
        :loading="temporaryWhitelistingActive === index"
        @click="temporarilyWhitelistUrl(time, index)"
      >
        <v-icon size="16" start>{{ mdiTimerOutline }}</v-icon>
        {{ time }} s
      </v-btn>
    </div>

    <div v-if="actionError" class="inline-error">
      {{ translate(I18NPopupKeys.popup_domain_action_error) }}
    </div>
    <ul v-if="failureDetails.length > 0" class="failure-details">
      <li v-for="detail in failureDetails" :key="detail">{{ detail }}</li>
    </ul>
  </section>
</template>

<script lang="ts">
import { mdiCheck, mdiClose, mdiTimerOutline } from '@mdi/js'
import {
  computed,
  defineComponent,
  onMounted,
  ref,
  watch,
  type PropType,
} from 'vue'
import ConnectorApiService from '../../../../service/ConnectorApiService'
import ApiList from '../../../../api/enum/ApiList'
import useTranslation from '../../../../hooks/translation'
import {
  StorageService,
  TemporaryAllowTimeDefaults,
} from '../../../../service/StorageService'
import TabService from '../../../../service/TabService'
import DomainStatusService from '../../../../service/DomainStatusService'
import type { DomainBlockingState } from '../../../../service/DomainStatusEvaluator'
import type { ConnectorScope } from '../../../../service/ConnectorApiService'
import ConnectorScopeDomainService from '../../../../service/ConnectorScopeDomainService'
import GroupDomainService from '../../../../service/GroupDomainService'
import { getOperationFailureDetails } from '../../../../service/MultiInstanceOperation'

export default defineComponent({
  name: 'PopupListCardComponent',
  props: {
    currentUrl: {
      type: String,
      required: true,
    },
    selectedGroup: {
      type: String as PropType<string | null>,
      default: null,
    },
    groups: {
      type: Array as PropType<ConnectorScope[]>,
      default: () => [],
    },
    groupsLoading: {
      type: Boolean,
      default: false,
    },
    hideGroupSelector: {
      type: Boolean,
      default: false,
    },
    hideGlobalListActions: {
      type: Boolean,
      default: false,
    },
    hideGroupListActions: {
      type: Boolean,
      default: false,
    },
    statusRefreshKey: {
      type: Number,
      default: 0,
    },
  },
  emits: ['selected-group-change', 'icon-state-change'],
  setup: (props, { emit }) => {
    const { translate, I18NPopupKeys } = useTranslation()
    const buttonsDisabled = ref(false)
    const globalActionLoading = ref<ApiList | null>(null)
    const groupActionLoading = ref<ApiList | null>(null)
    const temporaryWhitelistingActive = ref<number | null>(null)
    const temporaryAllowTimes = ref<number[]>([...TemporaryAllowTimeDefaults])
    const globalDomainStatus = ref<DomainBlockingState>('unknown')
    const groupDomainStatus = ref<DomainBlockingState>('unknown')
    const globalStatusLoading = ref(false)
    const groupStatusLoading = ref(false)
    const actionError = ref(false)
    const failureDetails = ref<string[]>([])

    const groupItems = computed(() =>
      props.groups.map((group) => ({ title: group.name, value: group.name })),
    )

    const selectedGroupModel = computed({
      get: () => props.selectedGroup,
      set: (groupName: string | null) =>
        emit('selected-group-change', groupName),
    })

    const getDomainStatusText = (
      status: DomainBlockingState,
      loading: boolean,
    ) => {
      if (loading) {
        return translate(I18NPopupKeys.popup_domain_status_checking)
      }
      if (status === 'blocked') {
        return translate(I18NPopupKeys.popup_domain_status_blocked)
      }
      if (status === 'allowed') {
        return translate(I18NPopupKeys.popup_domain_status_allowed)
      }
      return translate(I18NPopupKeys.popup_domain_status_unknown)
    }

    const getDomainStatusColor = (
      status: DomainBlockingState,
      loading: boolean,
    ) => {
      if (loading || status === 'unknown') {
        return 'grey-darken-1'
      }
      return status === 'blocked' ? 'red' : 'green'
    }

    const globalDomainStatusText = computed(() =>
      getDomainStatusText(globalDomainStatus.value, globalStatusLoading.value),
    )

    const groupDomainStatusText = computed(() =>
      getDomainStatusText(groupDomainStatus.value, groupStatusLoading.value),
    )

    const globalDomainStatusColor = computed(() =>
      getDomainStatusColor(globalDomainStatus.value, globalStatusLoading.value),
    )

    const groupDomainStatusColor = computed(() =>
      getDomainStatusColor(groupDomainStatus.value, groupStatusLoading.value),
    )

    const refreshGlobalDomainStatus = async () => {
      globalStatusLoading.value = true
      try {
        globalDomainStatus.value = await DomainStatusService.getDomainStatus(
          props.currentUrl,
        )
      } catch (reason) {
        console.warn(reason)
        globalDomainStatus.value = 'unknown'
      } finally {
        globalStatusLoading.value = false
      }
    }

    const refreshGroupDomainStatus = async () => {
      if (!props.selectedGroup) {
        groupDomainStatus.value = 'unknown'
        groupStatusLoading.value = false
        return
      }

      groupStatusLoading.value = true
      try {
        groupDomainStatus.value = await DomainStatusService.getDomainStatus(
          props.currentUrl,
          props.selectedGroup,
        )
      } catch (reason) {
        console.warn(reason)
        groupDomainStatus.value = 'unknown'
      } finally {
        groupStatusLoading.value = false
      }
    }

    const refreshCurrentTabBadge = async () => {
      try {
        await DomainStatusService.refreshCurrentTabBadge()
      } catch (reason) {
        console.warn(reason)
      } finally {
        emit('icon-state-change')
      }
    }

    const refreshDomainStatuses = async () => {
      await Promise.all([
        refreshGlobalDomainStatus(),
        refreshGroupDomainStatus(),
      ])
      await refreshCurrentTabBadge()
    }

    const finishAction = () => {
      globalActionLoading.value = null
      groupActionLoading.value = null
      temporaryWhitelistingActive.value = null
      buttonsDisabled.value = false
    }

    const reloadAfterWhitelist = async () => {
      if (await StorageService.getReloadAfterWhitelist()) {
        TabService.reloadCurrentTab(500)
      }
    }

    const listDomain = async (mode: ApiList) => {
      if (!props.currentUrl) {
        return
      }

      buttonsDisabled.value = true
      actionError.value = false
      failureDetails.value = []
      globalActionLoading.value = mode

      try {
        await ConnectorApiService.setDomainListGlobally(mode, props.currentUrl)
        await Promise.all([
          ConnectorScopeDomainService.cancelTemporaryAllowsForDomain(
            props.currentUrl,
          ),
          GroupDomainService.cancelTemporaryAllowsForDomain(props.currentUrl),
        ])
        await refreshDomainStatuses()

        if (mode === ApiList.whitelist) {
          await reloadAfterWhitelist()
        }
      } catch (reason) {
        console.warn(reason)
        actionError.value = true
        failureDetails.value = getOperationFailureDetails(reason)
      } finally {
        finishAction()
      }
    }

    const listDomainForGroup = async (mode: ApiList) => {
      if (!props.currentUrl || !props.selectedGroup) {
        return
      }

      buttonsDisabled.value = true
      actionError.value = false
      failureDetails.value = []
      groupActionLoading.value = mode

      try {
        await ConnectorScopeDomainService.setDomainListForScope(
          mode,
          props.currentUrl,
          props.selectedGroup,
        )
        await refreshDomainStatuses()

        if (mode === ApiList.whitelist) {
          await reloadAfterWhitelist()
        }
      } catch (reason) {
        console.warn(reason)
        actionError.value = true
        failureDetails.value = getOperationFailureDetails(reason)
      } finally {
        finishAction()
      }
    }

    const temporarilyWhitelistUrl = async (
      durationSeconds: number,
      timerIndex: number,
    ) => {
      if (!props.currentUrl || !props.selectedGroup || durationSeconds < 1) {
        return
      }

      buttonsDisabled.value = true
      actionError.value = false
      failureDetails.value = []
      temporaryWhitelistingActive.value = timerIndex

      try {
        await ConnectorScopeDomainService.temporarilyAllowDomainForScope(
          props.currentUrl,
          props.selectedGroup,
          durationSeconds,
        )
        await refreshDomainStatuses()
        await reloadAfterWhitelist()
      } catch (reason) {
        console.warn(reason)
        actionError.value = true
        failureDetails.value = getOperationFailureDetails(reason)
      } finally {
        finishAction()
      }
    }

    watch(
      () => [props.currentUrl, props.selectedGroup, props.statusRefreshKey],
      refreshDomainStatuses,
    )

    onMounted(async () => {
      const storedTimes = await StorageService.getTemporaryAllowTimes()
      if (storedTimes?.length === 3) {
        temporaryAllowTimes.value = storedTimes
      }
      await refreshDomainStatuses()
    })

    return {
      ApiList,
      globalActionLoading,
      groupActionLoading,
      temporaryWhitelistingActive,
      buttonsDisabled,
      temporaryAllowTimes,
      groupItems,
      selectedGroupModel,
      globalDomainStatusText,
      groupDomainStatusText,
      globalDomainStatusColor,
      groupDomainStatusColor,
      globalStatusLoading,
      groupStatusLoading,
      actionError,
      failureDetails,
      mdiCheck,
      mdiClose,
      mdiTimerOutline,
      listDomain,
      listDomainForGroup,
      temporarilyWhitelistUrl,
      translate,
      I18NPopupKeys,
    }
  },
})
</script>

<style scoped lang="scss">
.popup-section {
  padding: 10px 0 4px;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.section-title {
  margin-bottom: 7px;
  font-size: 14px;
  font-weight: 600;
}

.section-heading-row .section-title {
  margin-bottom: 0;
}

.domain-status {
  flex: 0 0 auto;
  font-size: 10px;
}

.status-scope {
  margin-top: -4px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 10px;
  line-height: 1.2;
}

.domain-display {
  overflow: hidden;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 5px;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permanent-actions,
.timer-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.domain-action,
.timer-button {
  min-width: 0;
  text-transform: none;
}

.section-divider {
  margin: 10px 0;
}

.group-select {
  margin-bottom: 8px;
}

.group-actions {
  margin-bottom: 9px;
}

.temporary-heading {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}

.timer-row {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.timer-button {
  padding-inline: 5px;
}

.inline-error {
  margin-top: 6px;
  color: rgb(var(--v-theme-error));
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
