<template>
  <v-app class="wormhole-options">
    <v-navigation-drawer class="glass-navigation" elevation="0">
      <div class="navigation-header">
        <img
          class="navigation-logo"
          src="icon/icon-128.png"
          alt=""
          width="44"
          height="44"
        />
        <div class="navigation-brand">
          <div class="navigation-title text-h6">
            {{ translate('extension_name') }}
          </div>
          <div class="navigation-suite">The Wormhole Suite</div>
        </div>
      </div>

      <v-divider></v-divider>

      <v-list density="compact" nav class="navigation-list">
        <v-list-item
          link
          to="/"
          :prepend-icon="mdiCog"
          :title="translate(I18NOptionKeys.options_settings)"
        />
        <v-list-item
          link
          to="/about"
          :prepend-icon="mdiInformationOutline"
          :title="translate(I18NOptionKeys.options_about)"
        />
        <v-divider />
        <v-list-item
          link
          :href="LinkConfig.github_issue"
          target="_blank"
          :prepend-icon="mdiFire"
          :title="translate(I18NOptionKeys.option_troubleshooting)"
        />
      </v-list>
    </v-navigation-drawer>
    <v-main class="options-main">
      <v-container fluid class="options-container">
        <router-view></router-view>
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { mdiCog, mdiFire, mdiInformationOutline } from '@mdi/js'
import useTranslation from '../../../../hooks/translation'

export default defineComponent({
  name: 'OptionComponent',
  setup: () => {
    const { translate, LinkConfig, I18NOptionKeys } = useTranslation()

    return {
      translate,
      LinkConfig,
      I18NOptionKeys,
      mdiCog,
      mdiInformationOutline,
      mdiFire,
    }
  },
})
</script>

<style scoped lang="scss">
.navigation-logo {
  display: block;
  width: 44px;
  height: 44px;
  object-fit: contain;
  filter: drop-shadow(0 0 12px rgba(91, 173, 255, 0.25));
}

.navigation-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
  min-height: 84px;
  padding: 14px 14px 14px 16px;
}

.navigation-brand {
  min-width: 0;
}

.navigation-title {
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.navigation-suite {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.navigation-list {
  padding: 10px 8px;
}

.options-container {
  max-width: 1440px;
  padding: 28px;
}
</style>

<style lang="scss">
html,
body,
#app {
  min-height: 100%;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at 14% 8%, rgba(42, 126, 255, 0.18), transparent 34%),
    radial-gradient(circle at 88% 16%, rgba(126, 74, 255, 0.14), transparent 30%),
    radial-gradient(circle at 58% 92%, rgba(0, 196, 255, 0.1), transparent 34%),
    rgb(var(--v-theme-background));
  background-attachment: fixed;
}

.wormhole-options,
.options-main {
  background: transparent !important;
}

.glass-navigation {
  background: rgba(var(--v-theme-surface), 0.74) !important;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.1) !important;
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
}

.wormhole-options .v-card,
.wormhole-options .v-alert,
.wormhole-options .v-expansion-panel,
.wormhole-options .v-table,
.wormhole-options .v-field {
  background: rgba(var(--v-theme-surface), 0.7) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1) !important;
  box-shadow:
    0 14px 42px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(20px) saturate(130%);
  -webkit-backdrop-filter: blur(20px) saturate(130%);
}

.wormhole-options .v-card {
  border-radius: 18px !important;
}

.wormhole-options .v-alert,
.wormhole-options .v-field {
  border-radius: 12px !important;
}

.wormhole-options .v-btn:not(.v-btn--icon) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-surface), 0.64);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.wormhole-options .v-list-item {
  border-radius: 12px !important;
}

.wormhole-options .v-list-item--active {
  background: rgba(var(--v-theme-primary), 0.12) !important;
}

.wormhole-options .v-divider {
  opacity: 0.42;
}

@media (max-width: 760px) {
  .options-container {
    padding: 16px !important;
  }
}
</style>
