<template>
  <div class="about-content">
    <section class="about-hero glass-panel">
      <div class="about-emblem" aria-hidden="true">
        <span></span>
      </div>
      <div>
        <span class="section-index">THE WORMHOLE SUITE</span>
        <h2>Wormhole Connector</h2>
        <p class="about-lead">{{ translate('manifest_description') }}</p>
        <div class="meta-chips">
          <span class="glass-chip">v{{ extensionVersion }}</span>
          <span class="glass-chip">Prerelease</span>
          <span class="glass-chip">Open Source</span>
        </div>
      </div>
    </section>

    <section class="about-grid">
      <article class="card glass-panel">
        <div class="card-heading card-heading--compact">
          <div>
            <span class="section-index">01</span>
            <h2>Projekt</h2>
            <p>
              Die aktuelle Produktidentität steht vollständig unter The Wormhole
              Suite.
            </p>
          </div>
        </div>
        <dl class="info-list">
          <div>
            <dt>Produkt</dt>
            <dd>Wormhole Connector</dd>
          </div>
          <div>
            <dt>Suite</dt>
            <dd>The Wormhole Suite</dd>
          </div>
          <div>
            <dt>Leitsatz</dt>
            <dd>Domains demystified</dd>
          </div>
          <div>
            <dt>Release-Kanal</dt>
            <dd>Dev · Prerelease</dd>
          </div>
        </dl>
      </article>

      <article class="card glass-panel credits-card">
        <div class="card-heading card-heading--compact">
          <div>
            <span class="section-index">02</span>
            <h2>Ursprüngliches Projekt</h2>
            <p>Credits werden bewusst nur an dieser Stelle geführt.</p>
          </div>
        </div>
        <p class="credits-copy">
          Wormhole Connector basiert auf dem ursprünglichen Open-Source-Projekt
          <strong>Pi-hole Browser Extension</strong> von
          <strong>Pascal Glaser (badsgahhl)</strong>.
        </p>
        <div class="credit-links">
          <a :href="LinkConfig.github_user_badsgahhl" target="_blank"
            >Pascal Glaser</a
          >
          <a :href="LinkConfig.github_user_limitationz" target="_blank"
            >Erik Rill</a
          >
          <a :href="LinkConfig.github_user_hypercrisis" target="_blank"
            >HyperCriSiS</a
          >
        </div>
        <a
          class="source-link"
          href="https://github.com/badsgahhl/pihole-browser-extension"
          target="_blank"
          rel="noreferrer"
        >
          Ursprüngliches Projekt
        </a>
      </article>
    </section>

    <section class="card glass-panel license-card">
      <div class="card-heading card-heading--compact">
        <div>
          <span class="section-index">03</span>
          <h2>Lizenz &amp; Quellcode</h2>
          <p>
            Transparente Open-Source-Herkunft ohne Fremdbranding in der
            Bedienoberfläche.
          </p>
        </div>
      </div>
      <div class="license-row">
        <div class="license-badge glass-chip">MIT</div>
        <p>
          Die Lizenz- und Copyright-Hinweise verbleiben in den vorgesehenen
          Projekt- und Lizenzdateien.
        </p>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import useTranslation from '../../../../hooks/translation'

export default defineComponent({
  name: 'OptionAboutExtension',
  setup: () => ({
    ...useTranslation(),
    extensionVersion: computed(() => chrome.runtime.getManifest().version),
  }),
})
</script>
