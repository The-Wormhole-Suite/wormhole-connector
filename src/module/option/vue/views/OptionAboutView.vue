<template>
  <div class="wormhole-view about-view">
    <header class="page-header">
      <div>
        <div class="eyebrow">ABOUT THE CONNECTOR</div>
        <h1>{{ translate(I18NOptionKeys.options_about) }}</h1>
        <p>
          Projektinformationen, Version und Herkunft des Open-Source-Projekts.
        </p>
      </div>
      <div class="header-status glass-chip">
        <span class="brand-mini" aria-hidden="true"></span>
        <div>
          <strong>Wormhole Connector</strong>
          <span>v{{ extensionVersion }}</span>
        </div>
      </div>
    </header>

    <OptionAboutExtension />
    <OptionAboutReportIssue class="diagnostics-card" />

    <footer class="page-footer">
      <span>Wormhole Connector</span>
      <span class="footer-line"></span>
      <span>Domains demystified</span>
    </footer>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import useTranslation from '../../../../hooks/translation'
import OptionAboutReportIssue from '../about/OptionAboutReportIssue.vue'
import OptionAboutExtension from '../about/OptionAboutExtension.vue'

export default defineComponent({
  name: 'OptionAboutTab',
  components: {
    OptionAboutReportIssue,
    OptionAboutExtension,
  },
  setup: () => {
    const translation = useTranslation()
    const extensionVersion = computed(
      () => chrome.runtime.getManifest().version,
    )

    return {
      ...translation,
      extensionVersion,
    }
  },
})
</script>
