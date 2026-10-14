import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const amoSafeDomLoader = require('../scripts/loaders/amo-safe-dom-loader.cjs') as (
  this: { resourcePath: string },
  source: string,
) => string

const vueRuntimeSource = [
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

test('AMO Vue transform eliminates both dynamic DOM HTML sinks', () => {
  const output = amoSafeDomLoader.call(
    { resourcePath: '/node_modules/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js' },
    vueRuntimeSource,
  )
  assert.doesNotMatch(output, /templateContainer\.innerHTML/)
  assert.doesNotMatch(output, /el\[key\] = key === "innerHTML"/)
  assert.match(output, /DOMParser/)
  assert.match(output, /Dynamic innerHTML is disabled in Wormhole Connector/)
  assert.match(output, /el\.textContent = value/)
})

test('AMO Vuetify transform uses textContent instead of innerHTML for theme CSS', () => {
  const output = amoSafeDomLoader.call(
    { resourcePath: '/node_modules/vuetify/lib/composables/theme.js' },
    '  styleEl.innerHTML = styles;',
  )
  assert.equal(output, '  styleEl.textContent = styles;')
})

test('AMO transforms fail closed when source shape changes', () => {
  assert.throws(
    () => amoSafeDomLoader.call(
      { resourcePath: '/node_modules/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js' },
      'export const changed = true',
    ),
    /expected exactly one matching source block/,
  )
  assert.throws(
    () => amoSafeDomLoader.call(
      { resourcePath: '/node_modules/vuetify/lib/composables/theme.js' },
      '  styleEl.innerHTML = styles;\n  styleEl.innerHTML = styles;',
    ),
    /expected exactly one matching source block/,
  )
  assert.throws(
    () => amoSafeDomLoader.call(
      { resourcePath: '/unknown/path.js' },
      'x',
    ),
    /Unexpected AMO-safe DOM loader target/,
  )
})
