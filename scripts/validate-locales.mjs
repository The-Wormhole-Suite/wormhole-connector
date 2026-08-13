import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const expectedLocales = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt_BR']
const localeRoot = '_locales'
const actualLocales = (await readdir(localeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

assertSameValues(actualLocales, expectedLocales, 'locale directories')

const reference = await readMessages('en')
const referenceKeys = Object.keys(reference).sort()

for (const locale of expectedLocales) {
  const messages = await readMessages(locale)
  assertSameValues(
    Object.keys(messages).sort(),
    referenceKeys,
    `${locale} keys`,
  )

  for (const key of referenceKeys) {
    const entry = messages[key]
    if (!entry || typeof entry.message !== 'string' || !entry.message.trim()) {
      throw new Error(`${locale}.${key} must contain a non-empty message`)
    }

    const expectedPlaceholders = Object.keys(
      reference[key].placeholders ?? {},
    ).sort()
    const actualPlaceholders = Object.keys(entry.placeholders ?? {}).sort()
    assertSameValues(
      actualPlaceholders,
      expectedPlaceholders,
      `${locale}.${key} placeholders`,
    )
  }
}

console.log('All eight locale bundles are complete and structurally valid.')

async function readMessages(locale) {
  const fileName = path.join(localeRoot, locale, 'messages.json')
  return JSON.parse(await readFile(fileName, 'utf8'))
}

function assertSameValues(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    const missing = expected.filter((value) => !actual.includes(value))
    const unexpected = actual.filter((value) => !expected.includes(value))
    throw new Error(
      `${label} mismatch; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`,
    )
  }
}
