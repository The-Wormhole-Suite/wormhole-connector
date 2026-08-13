'use strict'

/* global module */

const replaceExactlyOnce = (source, original, replacement, label) => {
  const first = source.indexOf(original)
  const last = source.lastIndexOf(original)
  if (first < 0 || first !== last) {
    throw new Error(
      `${label} build transform expected exactly one matching source block`,
    )
  }
  return source.replace(original, replacement)
}

module.exports = function amoSafeDomLoader(source) {
  if (this.resourcePath.includes('@vue/runtime-dom')) {
    let transformed = replaceExactlyOnce(
      source,
      `      templateContainer.innerHTML = unsafeToTrustedHTML(\n        namespace === "svg" ? \`<svg>\${content}</svg>\` : namespace === "mathml" ? \`<math>\${content}</math>\` : content\n      );\n      const template = templateContainer.content;`,
      `      const parser = new DOMParser();\n      const parsed = parser.parseFromString(unsafeToTrustedHTML(\n        namespace === "svg" ? \`<svg>\${content}</svg>\` : namespace === "mathml" ? \`<math>\${content}</math>\` : content\n      ), namespace === "svg" ? "image/svg+xml" : namespace === "mathml" ? "application/xml" : "text/html");\n      const wrapper = namespace === "svg" || namespace === "mathml" ? parsed.documentElement : parsed.body;\n      const template = doc.createDocumentFragment();\n      while (wrapper.firstChild) {\n        template.appendChild(doc.adoptNode(wrapper.firstChild));\n      }`,
      'Vue runtime DOM',
    )

    transformed = replaceExactlyOnce(
      transformed,
      `  if (key === "innerHTML" || key === "textContent") {\n    if (value != null) {\n      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;\n    }\n    return;\n  }`,
      `  if (key === "innerHTML") {\n    throw new Error("Dynamic innerHTML is disabled in Wormhole Connector");\n  }\n  if (key === "textContent") {\n    if (value != null) {\n      el.textContent = value;\n    }\n    return;\n  }`,
      'Vue dynamic DOM property',
    )

    return transformed
  }

  if (this.resourcePath.includes('vuetify/lib/composables/theme.js')) {
    return replaceExactlyOnce(
      source,
      '  styleEl.innerHTML = styles;',
      '  styleEl.textContent = styles;',
      'Vuetify theme',
    )
  }

  throw new Error(`Unexpected AMO-safe DOM loader target: ${this.resourcePath}`)
}
