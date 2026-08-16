<template>
  <v-app id="popup">
    <main class="popup-shell">
      <header class="popup-header">
        <div class="popup-heading">
          <img
            class="popup-status-icon"
            :src="headerIconPath"
            alt=""
            width="48"
            height="48"
          />
          <span>{{ translate(I18NPopupKeys.popup_status_card_title) }}</span>
        </div>
        <v-btn
          class="settings-button"
          :title="translate(I18NOptionKeys.options_settings)"
          icon
          size="x-small"
          variant="text"
          @click="openOptions"
        >
          <v-icon size="20">{{ mdiCog }}</v-icon>
        </v-btn>
      </header>

      <div class="popup-content">
        <PopupGlobalControlComponent @icon-state-change="refreshHeaderIcon" />
        <v-divider></v-divider>

        <PopupListCardComponent
          v-if="currentUrl"
          :current-url="currentUrl"
          :selected-group="selectedGroup"
          :groups="groups"
          :groups-loading="groupsLoading"
          :hide-group-selector="hideGroupSelector"
          :hide-global-list-actions="hideGlobalListActions"
          :hide-group-list-actions="hideGroupListActions"
          :status-refresh-key="groupStatusRefreshKey"
          @selected-group-change="setSelectedGroup"
          @icon-state-change="refreshHeaderIcon"
        />

        <PopupStatusCardComponent
          :selected-group="selectedGroup"
          :groups-loading="groupsLoading"
          :group-load-error="groupLoadError"
          @group-state-change="refreshGroupStatus"
        />
      </div>
    </main>
  </v-app>
</template>

<script lang="ts">
import { mdiCog } from '@mdi/js'
import { computed, defineComponent, onMounted, ref } from 'vue'
import PopupStatusCardComponent from '../components/PopupStatusCardComponent.vue'
import PopupListCardComponent from '../components/PopupListCardComponent.vue'
import PopupGlobalControlComponent from '../components/PopupGlobalControlComponent.vue'
import { StorageService } from '../../../../service/StorageService'
import TabService from '../../../../service/TabService'
import useTranslation from '../../../../hooks/translation'
import DomainStatusService from '../../../../service/DomainStatusService'
import PiHoleApiService from '../../../../service/PiHoleApiService'
import type { PiHoleGroup } from '../../../../api/models/PiHoleGroups'
import type { ToolbarIconState } from '../../../../service/BadgeState'

export default defineComponent({
  name: 'PopupComponent',
  components: {
    PopupGlobalControlComponent,
    PopupListCardComponent,
    PopupStatusCardComponent,
  },
  setup: () => {
    const { translate, I18NPopupKeys, I18NOptionKeys } = useTranslation()
    const currentUrl = ref('')
    const selectedGroup = ref<string | null>(null)
    const groups = ref<PiHoleGroup[]>([])
    const groupsLoading = ref(false)
    const groupLoadError = ref(false)
    const hideGroupSelector = ref(false)
    const hideGlobalListActions = ref(false)
    const hideGroupListActions = ref(false)
    const groupStatusRefreshKey = ref(0)
    const headerIconState = ref<ToolbarIconState>('unknown')
    let headerIconRequestId = 0

    const headerIconPath = computed(
      () => `icon/status/${headerIconState.value}-48.png`,
    )

    const refreshHeaderIcon = async () => {
      const requestId = ++headerIconRequestId

      try {
        const state = await DomainStatusService.getCurrentToolbarIconState()
        if (requestId === headerIconRequestId) {
          headerIconState.value = state
        }
      } catch (reason) {
        console.warn(reason)
        if (requestId === headerIconRequestId) {
          headerIconState.value = 'error'
        }
      }
    }

    const updateCurrentUrl = async () => {
      currentUrl.value = await TabService.getCurrentTabUrlCleaned()
      if (!currentUrl.value) {
        await DomainStatusService.refreshCurrentTabBadge()
      }
    }

    const loadPopupSettings = async () => {
      const [hideSelector, hideGlobalActions, hideGroupActions] =
        await Promise.all([
          StorageService.getHideGroupSelectorInPopup(),
          StorageService.getDisableListFeature(),
          StorageService.getHideGroupListActionsInPopup(),
        ])

      hideGroupSelector.value = hideSelector
      hideGlobalListActions.value = hideGlobalActions ?? false
      hideGroupListActions.value = hideGroupActions
    }

    const loadGroupSettings = async () => {
      groupsLoading.value = true
      groupLoadError.value = false
      const storedGroup = await StorageService.getPauseTarget()

      try {
        groups.value = await PiHoleApiService.getCommonGroups()
        const storedGroupExists = groups.value.some(
          (group) => group.name === storedGroup,
        )
        selectedGroup.value = storedGroupExists
          ? storedGroup!
          : groups.value[0]?.name || null

        if (selectedGroup.value && !storedGroupExists) {
          StorageService.savePauseTarget(selectedGroup.value)
        }
      } catch (reason) {
        console.warn(reason)
        groupLoadError.value = true
        selectedGroup.value = storedGroup || null
      } finally {
        groupsLoading.value = false
      }
    }

    const setSelectedGroup = async (groupName: string | null) => {
      selectedGroup.value = groupName
      if (!groupName) {
        return
      }

      await StorageService.savePauseTarget(groupName)
      await DomainStatusService.refreshCurrentTabBadge()
      await refreshHeaderIcon()
    }

    const refreshGroupStatus = () => {
      groupStatusRefreshKey.value += 1
      void refreshHeaderIcon()
    }

    const openOptions = () => chrome.runtime.openOptionsPage()

    onMounted(async () => {
      await Promise.all([
        updateCurrentUrl(),
        loadPopupSettings(),
        loadGroupSettings(),
      ])
      await refreshHeaderIcon()
    })

    return {
      mdiCog,
      currentUrl,
      selectedGroup,
      groups,
      groupsLoading,
      groupLoadError,
      hideGroupSelector,
      hideGlobalListActions,
      hideGroupListActions,
      groupStatusRefreshKey,
      headerIconPath,
      refreshHeaderIcon,
      refreshGroupStatus,
      setSelectedGroup,
      openOptions,
      translate,
      I18NPopupKeys,
      I18NOptionKeys,
    }
  },
})
</script>

<style lang="scss">
html,
body {
  min-width: 320px;
  background: rgb(var(--v-theme-surface));
}

#popup {
  width: 320px;
  min-height: 0;
  background: rgb(var(--v-theme-surface));
}

.popup-shell {
  width: 100%;
}

.popup-header {
  display: flex;
  min-height: 40px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px 9px 5px 10px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.popup-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.popup-status-icon {
  display: block;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  margin-top: 8px;
  object-fit: contain;
}

.settings-button {
  flex: 0 0 auto;
}

.popup-content {
  padding: 0 10px 8px;
}

#popup .section-heading-row {
  min-height: 22px;
  margin-bottom: 6px;
}

#popup .section-title,
#popup .global-control .control-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

#popup .domain-status {
  font-size: 10px;
  line-height: 1.2;
}

#popup .domain-display {
  font-size: 12px;
  line-height: 1.35;
}

#popup .group-control .control-label,
#popup .temporary-heading,
#popup .timer-label {
  font-size: 12px;
  line-height: 1.3;
}

#popup .domain-action,
#popup .timer-button {
  font-size: 12px;
  letter-spacing: 0;
}

#popup .group-select {
  --v-input-control-height: 36px;
}

#popup .group-select .v-field-label {
  display: none;
}

#popup .group-select .v-field__input {
  min-height: 36px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 12px;
  line-height: 1.3;
}
</style>
