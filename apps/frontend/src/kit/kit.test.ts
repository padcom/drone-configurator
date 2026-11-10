// @vitest-environment node
// kit.css is made of the tokens and nothing else: in every property that takes a colour the value is a `var()`, a
// `color-mix()` of them, or a keyword that is no colour of its own (`transparent`, `currentcolor`, `none`); every token
// it uses exists in tokens.css (a misspelt `var(--color-acent)` would silently draw nothing); and an invalid field is
// still red under the pointer.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A file of this folder, without its comments.
 *
 * @param name the file's name
 * @returns its text
 */
function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')
}

/** The properties whose value can be, or contain, a colour. */
const COLOUR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'outline',
  'outline-color',
  'accent-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  'text-decoration',
  'text-decoration-color',
  'caret-color',
])

/** What may stand in a colour property besides `var()` and `color-mix()`: no colour of its own, or a width or a style. */
const NEUTRAL = /\b(?:transparent|currentcolor|none|inherit|initial|solid|dashed|dotted|in|srgb)\b|-?[\d.]+(?:px|%|rem|em)?/gu

/**
 * What is left of a colour property's value once the tokens and the neutral words are taken out: a colour that was
 * written out (`white`, `#fff`, `oklch(…)`, `color(display-p3 …)`), if there is one.
 *
 * @param value the value of the property
 * @returns what remains
 */
function written(value: string): string {
  // Only the wrapper of a color-mix() goes: what it mixes is checked like any other value.
  return value
    .replaceAll(/var\([^)]*\)/gu, '')
    .replaceAll('color-mix(', '')
    .replaceAll(NEUTRAL, '')
    .replaceAll(/[\s,()]+/gu, ' ')
    .trim()
}

/**
 * The colour values of a stylesheet that are not made of tokens.
 *
 * @param css the stylesheet, without comments
 * @returns each offending declaration
 */
function untokenised(css: string): string[] {
  const declarations = [...css.matchAll(/(?<property>[\w-]+)\s*:\s*(?<value>[^;{}]+);/gu)]
  const parts = declarations.map(declaration => declaration.groups as Record<string, string>)

  return parts
    .filter(({ property, value }) => COLOUR_PROPERTIES.has(property ?? '') && written(value ?? '') !== '')
    .map(({ property, value }) => `${property}: ${value}`)
}

const kit = read('kit.css')
const defined = new Set([...read('tokens.css').matchAll(/(?<name>--[\w-]+)\s*:/gu)].map(match => match.groups?.name))

describe('the guard on colours', () => {
  it('lets through what is made of tokens, and the neutral keywords', () => {
    const fine = 'a { color: var(--color-text); background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); }'
    const edges = 'b { border: 1px solid currentcolor; outline: 2px solid var(--color-accent); background: none; border: 0; }'

    expect(untokenised(`${fine} ${edges}`)).toEqual([])
  })

  it('stops a colour that is written out, in any notation', () => {
    const bad = [
      'color: white',
      'background: #fff',
      'color: #FFFFFF80',
      'border: 1px solid black',
      'color: rgb(0 0 0)',
      'color: hsl(0 0% 0%)',
      'color: oklch(60% 0.1 200)',
      'color: lab(50 20 20)',
      'color: hwb(200 10% 10%)',
      'color: color(display-p3 1 0 0)',
      'background: color-mix(in srgb, red 50%, var(--color-bg))',
      'outline: 2px solid rebeccapurple',
    ]

    for (const declaration of bad) {
      expect(untokenised(`a { ${declaration}; }`), declaration).toHaveLength(1)
    }
  })
})

/** The stylesheets of the kit's controls: every one is made of tokens. */
const STYLESHEETS = ['kit.css', 'panels.css', 'dialog.css', 'surfaces.css', 'gallery.css'] as const

/** Custom properties that a component sets itself, not tokens: SplitPane.vue puts the first pane's size in `--split`. */
const LOCAL = new Set(['--split', '--hold-ms'])

describe.each(STYLESHEETS)('%s', name => {
  const css = read(name)

  it('writes no colour out', () => {
    expect(untokenised(css)).toEqual([])
  })

  it('uses only tokens that tokens.css defines', () => {
    const used = [...css.matchAll(/var\((?<name>--[\w-]+)/gu)].map(match => match.groups?.name)

    expect(used.length).toBeGreaterThan(10)
    expect(used.filter(token => !defined.has(token) && !LOCAL.has(token ?? ''))).toEqual([])
  })
})

describe('kit.css', () => {
  it('keeps an invalid field red under the pointer (the hover rule is more specific than `.invalid` alone)', () => {
    const rule = /(?<selectors>[^{}]+)\{(?<body>[^{}]*)\}/gu
    const red = [...kit.matchAll(rule)].filter(m => m.groups?.body?.includes('border-color: var(--color-error)'))
    const selectors = red.flatMap(m => (m.groups?.selectors ?? '').split(',').map(s => s.trim()))

    expect(selectors).toContain('.kit-input.invalid')
    expect(selectors).toContain('.kit-input.invalid:hover:not(:disabled)')
    // And it comes after the hover rule that would otherwise win.
    expect(kit.indexOf('.kit-input.invalid:hover')).toBeGreaterThan(kit.indexOf('.kit-input:hover'))
  })
})

describe('dialog.css', () => {
  it('keeps the empty live region rendered: clipped away, never display: none or visibility: hidden', () => {
    const rule = /\.safety-tapped:empty\s*\{(?<body>[^{}]*)\}/u.exec(read('dialog.css'))?.groups?.body ?? ''

    expect(rule).toContain('clip-path')
    expect(rule).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/u)
  })
})
