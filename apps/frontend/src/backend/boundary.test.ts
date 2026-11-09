// @vitest-environment node
// Only src/backend may import the Communicator: the lint rule really fires, with the project's own ESLint configuration.
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

/**
 * The rules that complain about a source file.
 *
 * @param filePath where the file would be, relative to apps/frontend
 * @param source its text
 * @returns the ids of the rules that reported, without repeats
 */
async function rulesFiredBy(filePath: string, source: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: root })
  const [result] = await eslint.lintText(source, { filePath })

  return [...new Set((result?.messages ?? []).map(message => message.ruleId ?? ''))]
}

const VALUE = 'import { Communicator } from \'@pico-desktop/communicator\'\n\nexport const made = Communicator\n'
const TYPE = 'import type { Transport } from \'@pico-desktop/communicator\'\n\nexport type Link = Transport\n'

describe('the backend boundary', () => {
  it('refuses the Communicator in a component\'s module', async () => {
    expect(await rulesFiredBy('src/Example.ts', VALUE)).toContain('no-restricted-imports')
  }, 120_000)

  it('refuses it in a composable and in a component', async () => {
    expect(await rulesFiredBy('src/useExample.ts', VALUE)).toContain('no-restricted-imports')
    const component = `<script setup lang="ts">\n${VALUE}</script>\n`

    expect(await rulesFiredBy('src/Example.vue', component)).toContain('no-restricted-imports')
  }, 120_000)

  it('allows it in src/backend, and a type import anywhere', async () => {
    expect(await rulesFiredBy('src/backend/example.ts', VALUE)).not.toContain('no-restricted-imports')
    expect(await rulesFiredBy('src/Example.ts', TYPE)).not.toContain('no-restricted-imports')
  }, 120_000)
})
