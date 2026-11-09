// @vitest-environment node
// The design tokens (tokens.css): both themes have every colour, the system's dark theme and the chosen one are the
// same, and each pair of text and background has the contrast WCAG 2 AA asks for (4.5 : 1 for text).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, luminance } from './contrast'

const AA_TEXT = 4.5

type Theme = Record<string, string>

/**
 * The custom properties in the body of a block.
 *
 * @param body the text between the braces
 * @returns each property's name and value
 */
function propertiesOf(body: string): Theme {
  const found = [...body.matchAll(/(?<name>--[\w-]+)\s*:\s*(?<value>[^;]+);/gu)]

  return Object.fromEntries(found.map(property => [property.groups?.name, property.groups?.value?.trim()])) as Theme
}

/**
 * A block as a map entry.
 *
 * @param groups the selector and the body of a rule
 * @returns the selector, and the custom properties in the body
 */
function blockOf(groups: Record<string, string | undefined>): [string, Theme] {
  return [(groups.selector ?? '').trim(), propertiesOf(groups.body ?? '')]
}

/**
 * The blocks of tokens.css by selector, each as its custom properties.
 *
 * @returns the blocks
 */
function readBlocks(): Map<string, Theme> {
  const text = readFileSync(fileURLToPath(new URL('tokens.css', import.meta.url)), 'utf8')
  const css = text.replaceAll(/\/\*[^]*?\*\//gu, '')
  const rules = [...css.matchAll(/(?<selector>[^{}]+)\{(?<body>[^{}]*)\}/gu)]

  return new Map(rules.map(rule => blockOf(rule.groups ?? {})))
}

const blocks = readBlocks()

const light = blocks.get(':root') ?? {}
const dark = blocks.get(`:root[data-theme='dark']`) ?? {}
const systemDark = blocks.get(`:root:not([data-theme='light'])`) ?? {}

const colours = Object.keys(light).filter(name => name.startsWith('--color-'))

/** What is read on what: a text colour and the backgrounds it is drawn on. */
const PAIRS: [text: string, backgrounds: string[]][] = [
  ['--color-text', ['--color-bg', '--color-surface']],
  ['--color-text-muted', ['--color-bg', '--color-surface']],
  ['--color-accent', ['--color-bg', '--color-surface']],
  ['--color-ok', ['--color-bg', '--color-surface']],
  ['--color-warn', ['--color-bg', '--color-surface']],
  ['--color-error', ['--color-bg', '--color-surface']],
  ['--color-on-accent', ['--color-accent']],
  // The connection badges: the page's background colour as text on the ok and the warn colour.
  ['--color-bg', ['--color-ok', '--color-warn']],
]

describe('the design tokens', () => {
  it('have the colours of the interface in the light theme, as #rrggbb', () => {
    expect(colours.length).toBeGreaterThanOrEqual(10)

    for (const name of colours) {
      expect(light[name], name).toMatch(/^#[\da-f]{6}$/u)
    }
  })

  it('have every colour in the dark theme too, and nothing else in it', () => {
    expect(Object.keys(dark).sort()).toEqual([...colours].sort())
  })

  it('give the dark theme the same colours whether the system asks for it or the user chose it', () => {
    expect(systemDark).toEqual(dark)
  })

  it('differ between the themes (a dark theme is not the light one)', () => {
    expect(luminance(dark['--color-bg'] ?? '#ffffff')).toBeLessThan(0.1)
    expect(luminance(light['--color-bg'] ?? '#000000')).toBeGreaterThan(0.9)
  })

  it('have the spacing, type, shape and density the components use', () => {
    for (const name of ['--space-1', '--space-5', '--font-body', '--font-size-md', '--radius-md', '--control-height']) {
      expect(light[name], name).toBeTruthy()
    }
  })
})

describe.each([['light', light], ['dark', dark]] as const)('the contrast in the %s theme', (_name, theme) => {
  it.each(PAIRS.flatMap(([text, backgrounds]) => backgrounds.map(background => [text, background] as const)))(
    '%s on %s is at least 4.5 : 1',
    (text, background) => {
      const ratio = contrast(theme[text] ?? '#000000', theme[background] ?? '#000000')

      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(AA_TEXT)
    },
  )
})

it('measures contrast as WCAG 2 does', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  expect(contrast('#ffffff', '#767676')).toBeGreaterThan(4.5)
  expect(contrast('#ffffff', '#777777')).toBeLessThan(4.5)
})
