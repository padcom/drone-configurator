// @vitest-environment node
// What surfaces.css draws for an urgent banner and a section label, read from the stylesheet (the pairs of text and fill
// themselves are checked for contrast in tokens.test.ts).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('surfaces.css', import.meta.url)), 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')

/**
 * The body of the rule with this selector.
 *
 * @param selector the rule's selector, as written
 * @returns the text between its braces, or an empty string
 */
function bodyOf(selector: string): string {
  const start = css.indexOf(`${selector} {`)

  return start < 0 ? '' : css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
}

describe('an urgent banner', () => {
  it.each([
    ['info', '--color-on-accent', '--color-accent'],
    ['warn', '--color-on-warn', '--color-warn'],
    ['error', '--color-on-error', '--color-error'],
  ])('is filled in its %s tone, with the words made for that fill', (tone, words, fill) => {
    const body = bodyOf(`.kit-banner.urgent.${tone}`)

    expect(body).toContain(`color: var(${words})`)
    expect(body).toContain(`background: var(${fill})`)
  })
})

describe('a button in an urgent banner', () => {
  it('has the banner\'s own words and edge, which are made for the fill, not the default button\'s light words', () => {
    const body = bodyOf('.kit-banner.urgent .actions .kit-button')

    expect(body).toContain('color: inherit')
    expect(body).toContain('border-color: currentcolor')
    expect(body).toContain('background: transparent')
  })
})

describe('the focus ring of a button in an urgent banner', () => {
  it('is in the banner\'s dark words, not the accent, which is about 1.4:1 on amber', () => {
    expect(bodyOf('.kit-banner.urgent .actions .kit-button:focus-visible')).toContain('outline-color: currentcolor')
  })
})

describe('a section label', () => {
  it('is 12 px, 600 and .09em, as the boards\' headings are, not the 11 px of a value\'s label', () => {
    const body = bodyOf('.kit-section-label')

    expect(body).toContain('font-size: var(--font-size-section)')
    expect(body).toContain('font-weight: 600')
    expect(body).toContain('letter-spacing: var(--letter-spacing-section)')
  })
})
