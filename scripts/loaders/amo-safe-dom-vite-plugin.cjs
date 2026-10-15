'use strict'

/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module */

const amoSafeDomLoader = require('./amo-safe-dom-loader.cjs')

const normalizeModuleId = (id) => id.split('?')[0].replace(/\\/g, '/')

const getTarget = (id) => {
  const normalized = normalizeModuleId(id)
  if (
    /(?:^|\/)node_modules\/@vue\/runtime-dom\/dist\/runtime-dom\.esm-bundler\.js$/.test(
      normalized,
    )
  ) {
    return 'vue'
  }
  if (
    /(?:^|\/)node_modules\/vuetify\/lib\/composables\/theme\.js$/.test(
      normalized,
    )
  ) {
    return 'vuetify'
  }
  return undefined
}

/**
 * Preserve Wormhole's exact-match AMO DOM patches when loading Vue/Vuetify
 * through Vite. This only guarantees source-level rewrites; the built artifact
 * still needs a separate review and browser/AMO lint verification.
 */
const createAmoSafeDomVitePlugin = ({ requireBothTargets = true } = {}) => {
  const seen = new Set()

  return {
    name: 'wormhole-amo-safe-dom',
    enforce: 'pre',
    config() {
      return {
        optimizeDeps: {
          // A pre-bundled dependency bypasses the Vite transform hook.
          exclude: ['vue', '@vue/runtime-dom', 'vuetify'],
        },
      }
    },
    buildStart() {
      seen.clear()
    },
    transform(source, id) {
      const target = getTarget(id)
      if (!target) return null
      const code = amoSafeDomLoader.call(
        { resourcePath: normalizeModuleId(id) },
        source,
      )
      seen.add(target)
      return { code, map: null }
    },
    generateBundle() {
      if (!requireBothTargets) return
      for (const target of ['vue', 'vuetify']) {
        if (!seen.has(target)) {
          throw new Error(
            `Wormhole AMO-safe Vite build did not transform expected ${target} source; inspect dependency optimization and module IDs`,
          )
        }
      }
    },
  }
}

module.exports = { createAmoSafeDomVitePlugin }
