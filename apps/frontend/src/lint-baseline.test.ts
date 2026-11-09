// @vitest-environment node
// The files that are not linted yet (eslint-baseline.txt) can only become fewer: one that doesn't exist
// any more, or that already follows the rules, must be taken off the list.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '@padcom/eslint-config-vue'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * The files on the list.
 *
 * @returns their paths, relative to apps/frontend
 */
function baseline(): string[] {
  return readFileSync(join(root, 'eslint-baseline.txt'), 'utf8')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
}

// The list may only get shorter: when files come off it, lower this number to the new length. A new
// file that breaks the rules has to be fixed, not added to the list.
const MOST_FILES = 10

/**
 * The files among `files` that have no lint error under all the rules.
 *
 * @param files paths relative to apps/frontend
 * @returns those that are clean
 */
async function cleanOnes(files: string[]): Promise<string[]> {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config['flat/browser'] })
  const results = await eslint.lintFiles(files)

  return results.filter(result => result.errorCount === 0).map(result => result.filePath.slice(root.length).replaceAll('\\', '/'))
}

describe('the lint baseline', () => {
  it('lists only files that exist, once each', () => {
    const files = baseline()

    expect(files.filter(file => !existsSync(join(root, file)))).toEqual([])
    expect(new Set(files).size).toBe(files.length)
    expect(files.length).toBeLessThanOrEqual(MOST_FILES)
  })

  it('lists only files that still break the rules: take a clean one off the list', async () => {
    expect(await cleanOnes(baseline())).toEqual([])
  }, 120_000)
})
