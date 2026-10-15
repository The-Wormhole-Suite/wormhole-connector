import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createAmoSafeDomVitePlugin } = require(
  '../scripts/loaders/amo-safe-dom-vite-plugin.cjs',
)

const vueSource = [
  '      templateContainer.innerHTML = unsafeToTrustedHTML(',
  '        namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content',
  '      );',
  '      const template = templateContainer.content;',
  '  if (key === "innerHTML" || key === "textContent") {',
  '    if (value != null) {',
  '      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;',
  '    }',
  '    return;',
  '  }',
].join('\n')

const vueId =
  '/work/node_modules/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js'
const vuetifyId = '/work/node_modules/vuetify/lib/composables/theme.js'

test('Vite plugin transforms both Vue and Vuetify with the existing hardened loader', () => {
  const plugin = createAmoSafeDomVitePlugin()
  assert.equal(plugin.enforce, 'pre')
  assert.deepEqual(plugin.config().optimizeDeps.exclude, [
    'vue',
    '@vue/runtime-dom',
    'vuetify',
  ])
  plugin.buildStart()
  const vue = plugin.transform(vueSource, `${vueId}?v=12`)
  assert.doesNotMatch(vue.code, /templateContainer\.innerHTML/)
  assert.match(vue.code, /DOMParser/)
  assert.match(vue.code, /Dynamic innerHTML is disabled/)
  const vuetify = plugin.transform(
    '  styleEl.innerHTML = styles;',
    vuetifyId.replaceAll('/', '\\'),
  )
  assert.match(vuetify.code, /styleEl.textContent = styles/)
  assert.doesNotThrow(() => plugin.generateBundle())
})

test('Vite plugin ignores unrelated source and rejects changed vendor sources', () => {
  const plugin = createAmoSafeDomVitePlugin()
  plugin.buildStart()
  assert.equal(plugin.transform(vueSource, '/work/src/runtime-dom.ts'), null)
  assert.equal(plugin.transform(vueSource, '/work/src/vendor/theme.js'), null)
  assert.throws(
    () => plugin.transform('changed Vue source', vueId),
    /expected exactly one matching source block/,
  )
  assert.throws(
    () => plugin.generateBundle(),
    /did not transform expected vue source/,
  )
})

test('Vite plugin fails closed if a required dependency was optimized away', () => {
  const plugin = createAmoSafeDomVitePlugin()
  plugin.buildStart()
  plugin.transform(vueSource, vueId)
  assert.throws(
    () => plugin.generateBundle(),
    /did not transform expected vuetify source/,
  )
  // A production build that deliberately omits the GUI can opt out explicitly.
  const backgroundOnly = createAmoSafeDomVitePlugin({
    requireBothTargets: false,
  })
  backgroundOnly.buildStart()
  assert.doesNotThrow(() => backgroundOnly.generateBundle())
})
