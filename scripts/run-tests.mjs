import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const testFiles = (await readdir('tests', { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.mjs')),
  )
  .map((entry) => path.join('tests', entry.name))
  .sort()

if (testFiles.length === 0) {
  throw new Error('No test files were found in tests/.')
}

const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--test', ...testFiles],
  { stdio: 'inherit' },
)

child.on('error', (error) => {
  throw error
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Test process terminated by signal ${signal}.`)
    process.exitCode = 1
    return
  }

  process.exitCode = code ?? 1
})
