// @vitest-environment node
// The design tokens (tokens.css): the one dark theme has every colour, and each pair of text and background has the
// contrast WCAG 2 AA asks for (4.5 : 1 for text).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, luminance } from './contrast'

const AA_TEXT = 4.5
const AA_UI = 3

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
 * The rules of tokens.css, without its comments: a selector and a body each.
 *
 * @returns the rules' named groups
 */
function readRules(): Record<string, string | undefined>[] {
  const text = readFileSync(fileURLToPath(new URL('tokens.css', import.meta.url)), 'utf8')
  const css = text.replaceAll(/\/\*[^]*?\*\//gu, '')

  return [...css.matchAll(/(?<selector>[^{}]+)\{(?<body>[^{}]*)\}/gu)].map(rule => rule.groups ?? {})
}

/**
 * The `color-scheme` that a body declares.
 *
 * @param body the text between the braces
 * @returns the scheme, or an empty string
 */
function schemeIn(body: string): string {
  const found = /color-scheme\s*:\s*(?<scheme>[^;]+);/u.exec(body)

  return (found?.groups?.scheme ?? '').trim()
}

/**
 * A rule's `color-scheme`.
 *
 * @param groups the selector and the body of a rule
 * @returns the selector, and what the rule says its colour scheme is (empty: nothing)
 */
function schemeOf(groups: Record<string, string | undefined>): [string, string] {
  return [(groups.selector ?? '').trim(), schemeIn(groups.body ?? '')]
}

const rules = readRules()
const blocks = new Map(rules.map(rule => blockOf(rule)))
const schemes = new Map(rules.map(rule => schemeOf(rule)))

const tokens = blocks.get(':root') ?? {}

const colours = Object.keys(tokens).filter(name => name.startsWith('--color-'))

/** What is read on what: a text colour and the backgrounds it is drawn on. */
const PAIRS: [text: string, backgrounds: string[]][] = [
  ['--color-text', ['--color-bg', '--color-surface', '--color-surface-raised']],
  ['--color-text-muted', ['--color-bg', '--color-surface', '--color-surface-raised']],
  ['--color-accent', ['--color-bg', '--color-surface', '--color-accent-soft']],
  ['--color-ok', ['--color-bg', '--color-surface', '--color-ok-soft']],
  ['--color-warn', ['--color-bg', '--color-surface', '--color-warn-soft']],
  ['--color-error', ['--color-bg', '--color-surface', '--color-error-soft']],
  ['--color-on-accent', ['--color-accent']],
  // The connection badges: the page's background colour as text on the ok and the warn colour.
  ['--color-bg', ['--color-ok', '--color-warn']],
  // Dim text, a link under the pointer, and the text of a filled amber or red button or banner.
  ['--color-text-dim', ['--color-bg', '--color-surface', '--color-surface-raised']],
  ['--color-accent-hover', ['--color-bg', '--color-surface', '--color-surface-raised']],
  ['--color-on-warn', ['--color-warn', '--color-warn-progress']],
  ['--color-on-error', ['--color-error', '--color-error-progress']],
]

describe('the design tokens', () => {
  it('have the colours of the interface, as #rrggbb', () => {
    expect(colours.length).toBeGreaterThanOrEqual(10)

    for (const name of colours) {
      expect(tokens[name], name).toMatch(/^#[\da-f]{6}$/u)
    }
  })

  it('have the spacing, type, shape and control size the components use', () => {
    for (const name of ['--space-1', '--space-5', '--font-body', '--font-size-md', '--radius-md', '--control-height']) {
      expect(tokens[name], name).toBeTruthy()
    }
  })
})

describe('the design tokens of the control-center design', () => {
  it('have the colours that the boards wrote as literals', () => {
    for (const name of [
      '--color-text-dim',
      '--color-on-warn',
      '--color-on-error',
      '--color-warn-progress',
      '--color-error-progress',
      '--color-accent-hover',
      '--color-map',
    ]) {
      expect(tokens[name], name).toMatch(/^#[\da-f]{6}$/u)
    }
    expect(tokens['--hud-sky']).toBe('#2c6e9b')
    expect(tokens['--hud-ground']).toBe('#6b4a2b')
    expect(tokens['--hatch']).toContain('repeating-linear-gradient')
  })
})

describe('the design tokens, the scales', () => {
  it('have the type scale, the spacing steps and the layout sizes', () => {
    for (const name of [
      '--font-size-label',
      '--font-size-value-sm',
      '--font-size-value',
      '--font-size-card',
      '--font-size-title',
      '--font-size-2xl',
      '--font-size-hero',
      '--letter-spacing-label',
      '--space-6',
      '--space-7',
      '--space-8',
    ]) {
      expect(tokens[name], name).toBeTruthy()
    }
    expect([tokens['--rail-width'], tokens['--topbar-height']]).toEqual(['76px', '64px'])
  })
})

describe('the design tokens, the typefaces', () => {
  it('name the two typefaces first, with a system font after them', () => {
    expect(tokens['--font-body']).toMatch(/^'IBM Plex Sans', /u)
    expect(tokens['--font-mono']).toMatch(/^'IBM Plex Mono', /u)
  })
})

it('have one control height, 44 px, with nothing to change it', () => {
  expect(tokens['--control-height']).toBe('44px')
})

describe('the theme', () => {
  it('is the only one: dark, and the browser is told, so its own controls and scrollbars match the page', () => {
    expect([...blocks.keys()]).toEqual([':root'])
    expect(schemes.get(':root')).toBe('dark')
    expect(luminance(tokens['--color-bg'] ?? '#ffffff')).toBeLessThan(0.1)
  })
})

describe('the contrast', () => {
  it.each(PAIRS.flatMap(([text, backgrounds]) => backgrounds.map(background => [text, background] as const)))(
    '%s on %s is at least 4.5 : 1',
    (text, background) => {
      const ratio = contrast(tokens[text] ?? '#000000', tokens[background] ?? '#000000')

      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(AA_TEXT)
    },
  )

  // WCAG 2.1, 1.4.11: what shows where a control is (its edge) needs 3 : 1 against what is around it.
  const AROUND = ['--color-bg', '--color-surface', '--color-surface-raised']

  it.each(AROUND)('a control\'s edge (--color-border-strong) on %s is 3 : 1', background => {
    const ratio = contrast(tokens['--color-border-strong'] ?? '#000000', tokens[background] ?? '#000000')

    expect(ratio).toBeGreaterThanOrEqual(AA_UI)
  })
})

it('measures contrast as WCAG 2 does', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  expect(contrast('#ffffff', '#767676')).toBeGreaterThan(4.5)
  expect(contrast('#ffffff', '#777777')).toBeLessThan(4.5)
})
