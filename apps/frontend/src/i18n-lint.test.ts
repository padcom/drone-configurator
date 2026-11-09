// @vitest-environment node
// The i18n lint rules really fire, with the project's own ESLint configuration: a component with literal text, or
// asking for a message that does not exist, is an error.
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * The rules that complain about a component's source.
 *
 * @param source the text of a .vue file
 * @returns the ids of the rules that reported, without repeats
 */
async function rulesFiredBy(source: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: root })
  const [result] = await eslint.lintText(source, { filePath: 'src/Example.vue' })

  return [...new Set((result?.messages ?? []).map(message => message.ruleId ?? ''))]
}

/**
 * A component with a template and a script.
 *
 * @param template the markup of its root
 * @param script the body of its `<script setup>`
 * @returns the text of the .vue file
 */
function component(template: string, script = ''): string {
  return `<template>\n  ${template}\n</template>\n\n<script setup lang="ts">\n${script}</script>\n`
}

describe('the i18n lint rules', () => {
  it('refuse text written in a template', async () => {
    expect(await rulesFiredBy(component('<p>Hello there</p>'))).toContain('@intlify/vue-i18n/no-raw-text')
  }, 120_000)

  it('refuse a message key that is not in en.json', async () => {
    const script = 'import { useI18n } from \'vue-i18n\'\n\nconst { t } = useI18n()\nconst text = t(\'no.such.key\')\n'

    expect(await rulesFiredBy(component('<p>{{ text }}</p>', script))).toContain('@intlify/vue-i18n/no-missing-keys')
  }, 120_000)

  it('accept a message that exists, and numbers and punctuation', async () => {
    const script = 'import { useI18n } from \'vue-i18n\'\n\nconst { t } = useI18n()\n'
    const rules = await rulesFiredBy(component('<p>{{ t(\'app.title\') }} <b>14550</b> <i>·</i></p>', script))

    expect(rules.filter(rule => rule.startsWith('@intlify'))).toEqual([])
  }, 120_000)
})
