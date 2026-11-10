// @vitest-environment node
// What each variant of a control draws: the colour of its words and of what is behind them, read from the stylesheet
// itself and resolved through tokens.css, and the contrast between them (WCAG 2 AA asks 4.5 : 1 for text). A variant that
// is restyled to a pair that does not read fails here, not in a review of a picture.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast } from './contrast'

const AA_TEXT = 4.5

/**
 * A file of this folder, without its comments.
 *
 * @param name the file's name
 * @returns its text
 */
function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')
}

const colourTokens = [...read('tokens.css').matchAll(/(?<name>--[\w-]+)\s*:\s*(?<value>#[\da-f]{6})/giu)]
const tokens = Object.fromEntries(colourTokens.map(m => [m.groups?.name, m.groups?.value])) as Record<string, string>

const sheets: Record<string, string> = {
  'kit.css': read('kit.css'),
  'panels.css': read('panels.css'),
  'dialog.css': read('dialog.css'),
}

/**
 * The body of the rule with this selector.
 *
 * @param sheet which stylesheet
 * @param selector the rule's selector, exactly as written
 * @returns the text between its braces, or an empty string
 */
function bodyOf(sheet: string, selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
  const rule = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{(?<body>[^}]*)\\}`, 'u').exec(sheets[sheet] as string)

  return rule?.groups?.body ?? ''
}

/**
 * The colour (as #rrggbb) that a rule gives a property, through its `var()`.
 *
 * @param sheet which stylesheet
 * @param selector the rule's selector, exactly as written
 * @param property `color` or `background`
 * @returns the colour, or undefined when the rule does not set it
 */
function colourOf(sheet: string, selector: string, property: string): string | undefined {
  const used = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*var\\((?<token>--[\\w-]+)\\)`, 'u').exec(bodyOf(sheet, selector))

  return tokens[used?.groups?.token ?? '']
}

/** Each variant, in each state: the rule that sets its words, the rule that sets its fill (the same one for most). */
const VARIANTS: [name: string, sheet: string, words: string, fill: string][] = [
  ['primary', 'kit.css', '.kit-button.primary', '.kit-button.primary'],
  ['primary, under the pointer', 'kit.css', '.kit-button.primary', '.kit-button.primary:hover:not(:disabled)'],
  ['flight', 'kit.css', '.kit-button.flight', '.kit-button.flight'],
  ['flight, under the pointer', 'kit.css', '.kit-button.flight', '.kit-button.flight:hover:not(:disabled)'],
  ['hold, amber', 'dialog.css', '.kit-hold.warn', '.kit-hold.warn'],
  ['hold, red', 'dialog.css', '.kit-hold.error', '.kit-hold.error'],
  ['hold, unavailable', 'dialog.css', '.kit-hold:disabled', '.kit-hold:disabled'],
  ['disabled', 'kit.css', '.kit-button:disabled', '.kit-button:disabled'],
  ['badge, info', 'kit.css', '.kit-badge.info', '.kit-badge.info'],
  ['badge, ok', 'kit.css', '.kit-badge.ok', '.kit-badge.ok'],
  ['badge, warn', 'kit.css', '.kit-badge.warn', '.kit-badge.warn'],
  ['badge, error', 'kit.css', '.kit-badge.error', '.kit-badge.error'],
  ['badge, neutral', 'kit.css', '.kit-badge', '.kit-badge'],
  ['chosen segment', 'panels.css', '.kit-segmented .segment:has(input:checked)', '.kit-segmented .segment:has(input:checked)'],
  ['chosen tab', 'panels.css', '.kit-tabs .tab[aria-selected=\'true\']', '.kit-tabs .tab[aria-selected=\'true\']'],
  ['tab', 'panels.css', '.kit-tabs .tab', '.kit-tabs .tab:hover'],
]

describe('the colours of each variant', () => {
  it.each(VARIANTS)('%s: its words read on its fill', (_name, sheet, words, fill) => {
    const text = colourOf(sheet, words, 'color')
    const behind = colourOf(sheet, fill, 'background')

    expect(text, `${words} sets a colour`).toBeDefined()
    expect(behind, `${fill} sets a background`).toBeDefined()
    expect(contrast(text ?? '#000000', behind ?? '#000000'), `${words} on ${fill}`).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('has a button under the pointer that is raised, with the words of the page on it', () => {
    const behind = colourOf('kit.css', '.kit-button:hover:not(:disabled)', 'background')

    expect(behind).toBe(tokens['--color-surface-raised'])
    expect(contrast(tokens['--color-text'] ?? '#000000', behind ?? '#000000')).toBeGreaterThanOrEqual(AA_TEXT)
  })
})

describe('the sizes and weights of the controls', () => {
  it('gives every target the control height, and the words of a tab and a primary button the design\'s weights', () => {
    expect(bodyOf('panels.css', '.kit-tabs .tab')).toContain('min-height: var(--control-height)')
    expect(bodyOf('kit.css', '.kit-toggle')).toContain('min-height: var(--control-height)')
    expect(bodyOf('kit.css', '.kit-check')).toContain('min-height: var(--control-height)')
    expect(bodyOf('kit.css', '.kit-button.primary')).toContain('font-weight: 600')
    expect(bodyOf('kit.css', '.kit-button.flight')).toContain('font-weight: 700')
    expect(bodyOf('panels.css', '.kit-tabs .tab')).toContain('font-weight: 500')
  })

  it('draws the unchosen words of a tab in the text colour, not the muted one', () => {
    expect(colourOf('panels.css', '.kit-tabs .tab', 'color')).toBe(tokens['--color-text'])
  })
})

describe('the disabled button', () => {
  it('is drawn flat: not the faded outline, and not a colour that says "on"', () => {
    const fill = colourOf('kit.css', '.kit-button:disabled', 'background')

    expect(fill).toBe(tokens['--color-border'])
    expect(fill).not.toBe(tokens['--color-accent'])
    expect(fill).not.toBe(tokens['--color-warn'])
  })
})
