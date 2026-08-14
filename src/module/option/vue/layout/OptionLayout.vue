<template>
  <v-app class="wormhole-app">
    <div class="app-shell">
      <aside class="sidebar glass-panel">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <span class="brand-mark__ring"></span>
            <span class="brand-mark__core"></span>
          </div>
          <div class="brand-copy">
            <span class="suite-name">THE WORMHOLE SUITE</span>
            <strong>Wormhole<br />Connector</strong>
          </div>
        </div>

        <div class="sidebar-divider"></div>

        <nav
          class="navigation"
          :aria-label="translate(I18NOptionKeys.options_settings)"
        >
          <router-link
            class="nav-item"
            active-class="nav-item--active"
            exact-active-class="nav-item--active"
            to="/"
          >
            <v-icon :icon="mdiCog" />
            <span>{{ translate(I18NOptionKeys.options_settings) }}</span>
            <span class="nav-indicator"></span>
          </router-link>
          <router-link
            class="nav-item"
            active-class="nav-item--active"
            to="/about"
          >
            <v-icon :icon="mdiInformationOutline" />
            <span>{{ translate(I18NOptionKeys.options_about) }}</span>
            <span class="nav-indicator"></span>
          </router-link>
          <div class="nav-separator"></div>
          <a
            class="nav-item"
            :href="LinkConfig.github_issue"
            target="_blank"
            rel="noreferrer"
          >
            <v-icon :icon="mdiFire" />
            <span>{{ translate(I18NOptionKeys.option_troubleshooting) }}</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <span class="build-label">WORMHOLE CONNECTOR</span>
          <span>v{{ extensionVersion }} · Dev Prerelease</span>
          <span>THE WORMHOLE SUITE</span>
        </div>
      </aside>

      <main class="main-content">
        <router-view></router-view>
      </main>
    </div>
  </v-app>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import { mdiCog, mdiFire, mdiInformationOutline } from '@mdi/js'
import useTranslation from '../../../../hooks/translation'

export default defineComponent({
  name: 'OptionComponent',
  setup: () => {
    const { translate, LinkConfig, I18NOptionKeys } = useTranslation()
    const extensionVersion = computed(
      () => chrome.runtime.getManifest().version,
    )

    return {
      extensionVersion,
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
