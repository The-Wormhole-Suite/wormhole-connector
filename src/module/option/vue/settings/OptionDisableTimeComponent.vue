<template>
  <section class="settings-grid">
    <v-card class="card glass-panel client-card">
      <div class="card-heading card-heading--compact">
        <div>
          <span class="section-index">02</span>
          <h2>{{ translate(I18NOptionKeys.options_client_group_title) }}</h2>
          <p>Zielgruppe und sichtbare Aktionen im Popup.</p>
        </div>
      </div>

      <v-select
        v-model="selectedGroup"
        :items="groupItems"
        :label="translate(I18NOptionKeys.options_default_client_group)"
        :loading="groupsLoading"
        :disabled="groupsLoading || groupItems.length === 0"
        :error-messages="
          groupLoadError
            ? [translate(I18NOptionKeys.options_client_group_load_error)]
            : []
        "
        variant="outlined"
        density="compact"
      ></v-select>

      <div class="toggle-list">
        <v-checkbox
          v-model="hideGroupSelectorInPopup"
          :label="translate(I18NOptionKeys.options_hide_group_selector_in_popup)"
          hide-details
        ></v-checkbox>
        <v-checkbox
          v-model="hideGroupListActionsInPopup"
          :label="
            translate(I18NOptionKeys.options_hide_group_list_actions_in_popup)
          "
          hide-details
        ></v-checkbox>
        <v-checkbox
          v-model="badgeUsesSelectedGroup"
          :label="translate(I18NOptionKeys.options_badge_uses_selected_group)"
          hide-details
        ></v-checkbox>
      </div>
    </v-card>

    <v-card class="card glass-panel times-card">
      <div class="card-heading card-heading--compact">
        <div>
          <span class="section-index">03</span>
          <h2>Zeitvorgaben</h2>
          <p>Schnellwahlwerte für temporäre Aktionen.</p>
        </div>
      </div>

      <div class="setting-section">
        <div class="setting-label">
          <strong>{{ translate(I18NOptionKeys.options_group_pause_times_title) }}</strong>
          <span>{{ translate(I18NOptionKeys.options_default_time_unit) }}</span>
        </div>
        <v-row>
          <v-col
            v-for="(_, index) in groupPauseTimes"
            :key="`group-${index}`"
            cols="12"
            sm="4"
          >
            <v-text-field
              v-model.number="groupPauseTimes[index]"
              :label="`${translate(
                I18NOptionKeys.options_group_pause_time_label,
              )} ${index + 1}`"
              type="number"
              min="10"
              variant="outlined"
              :rules="[(v) => Number(v) >= 10 || '≥ 10']"
              hide-details="auto"
            ></v-text-field>
          </v-col>
        </v-row>
      </div>

      <div class="setting-section">
        <div class="setting-label">
          <strong>{{ translate(I18NOptionKeys.options_temporary_allow_times_title) }}</strong>
          <span>{{ translate(I18NOptionKeys.options_default_time_unit) }}</span>
        </div>
        <v-row>
          <v-col
            v-for="(_, index) in temporaryAllowTimes"
            :key="`domain-${index}`"
            cols="12"
            sm="4"
          >
            <v-text-field
              v-model.number="temporaryAllowTimes[index]"
              :label="`${translate(
                I18NOptionKeys.options_temporary_allow_time_label,
              )} ${index + 1}`"
              type="number"
              min="10"
              variant="outlined"
              :rules="[(v) => Number(v) >= 10 || '≥ 10']"
              hide-details="auto"
            ></v-text-field>
          </v-col>
        </v-row>
      </div>
    </v-card>
  </section>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue'
import {
  GroupPauseTimeDefaults,
  StorageService,
  TemporaryAllowTimeDefaults,
} from '../../../../service/StorageService'
import useTranslation from '../../../../hooks/translation'
import ConnectorApiService, {
  type ConnectorScope,
} from '../../../../service/ConnectorApiService'

const areValidPresetTimes = (times: number[]): boolean => {
  const normalizedTimes = times.map(Number)
  return (
    normalizedTimes.length === 3 &&
    normalizedTimes.every((time) => Number.isInteger(time) && time >= 10)
  )
}

export default defineComponent({
  name: 'OptionActionTimesComponent',
  setup: () => {
    const { translate, I18NOptionKeys } = useTranslation()
    const groups = ref<ConnectorScope[]>([])
    const groupsLoading = ref(false)
    const groupLoadError = ref(false)
    const selectedGroup = ref<string | null>(null)
    const hideGroupSelectorInPopup = ref(false)
    const hideGroupListActionsInPopup = ref(false)
    const badgeUsesSelectedGroup = ref(false)
    const groupPauseTimes = ref<number[]>([...GroupPauseTimeDefaults])
    const temporaryAllowTimes = ref<number[]>([...TemporaryAllowTimeDefaults])

    const groupItems = computed(() =>
      groups.value.map((group) => ({ title: group.name, value: group.name })),
    )

    const updateSettings = async () => {
      groupsLoading.value = true
      groupLoadError.value = false

      const [
        storedGroupPauseTimes,
        storedTemporaryAllowTimes,
        storedGroup,
        hideSelector,
        hideGroupActions,
        useSelectedGroupForBadge,
      ] = await Promise.all([
        StorageService.getGroupPauseTimes(),
        StorageService.getTemporaryAllowTimes(),
        StorageService.getPauseTarget(),
        StorageService.getHideGroupSelectorInPopup(),
        StorageService.getHideGroupListActionsInPopup(),
        StorageService.getBadgeUsesSelectedGroup(),
      ])

      if (storedGroupPauseTimes?.length === 3) {
        groupPauseTimes.value = [...storedGroupPauseTimes]
      }
      if (storedTemporaryAllowTimes?.length === 3) {
        temporaryAllowTimes.value = [...storedTemporaryAllowTimes]
      }
      hideGroupSelectorInPopup.value = hideSelector
      hideGroupListActionsInPopup.value = hideGroupActions
      badgeUsesSelectedGroup.value = useSelectedGroupForBadge

      try {
        groups.value = await ConnectorApiService.getCommonScopes()
        const validStoredGroup = groups.value.some(
          (group) => group.name === storedGroup,
        )
        selectedGroup.value = validStoredGroup
          ? storedGroup!
          : groups.value[0]?.name || null

        if (selectedGroup.value && !validStoredGroup) {
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

    watch(selectedGroup, (groupName) => {
      if (groupName) {
        StorageService.savePauseTarget(groupName)
      }
    })

    watch(hideGroupSelectorInPopup, (state) => {
      StorageService.saveHideGroupSelectorInPopup(state)
    })

    watch(hideGroupListActionsInPopup, (state) => {
      StorageService.saveHideGroupListActionsInPopup(state)
    })

    watch(badgeUsesSelectedGroup, (state) => {
      StorageService.saveBadgeUsesSelectedGroup(state)
    })

    watch(
      groupPauseTimes,
      (times) => {
        if (areValidPresetTimes(times)) {
          StorageService.saveGroupPauseTimes(times.map(Number))
        }
      },
      { deep: true },
    )

    watch(
      temporaryAllowTimes,
      (times) => {
        if (areValidPresetTimes(times)) {
          StorageService.saveTemporaryAllowTimes(times.map(Number))
        }
      },
      { deep: true },
    )

    onMounted(() => updateSettings())

    return {
      translate,
      I18NOptionKeys,
      groupItems,
      groupsLoading,
      groupLoadError,
      selectedGroup,
      hideGroupSelectorInPopup,
      hideGroupListActionsInPopup,
      badgeUsesSelectedGroup,
      groupPauseTimes,
      temporaryAllowTimes,
    }
  },
})
</script>
