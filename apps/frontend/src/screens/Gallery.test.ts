import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { i18n } from '../i18n'
import { ICONS } from '../kit/icons'
import Gallery from './Gallery.vue'

let mounted: VueWrapper | undefined

/**
 * The gallery, in the document.
 *
 * @returns the wrapper
 */
function gallery(): VueWrapper {
  mounted = mount(Gallery, { global: { plugins: [i18n] }, attachTo: document.body })

  return mounted
}

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

const CONTROLS = [
  '.kit-button',
  '.kit-input',
  '.kit-select',
  '.kit-check',
  '.kit-toggle',
  '.kit-badge',
  '.kit-segmented',
  '.kit-tabs',
  '.kit-split',
]

it('shows every control of the kit', () => {
  const page = gallery()

  for (const selector of CONTROLS) {
    expect(page.find(selector).exists(), selector).toBe(true)
  }
})

it('shows each control in the states it has: normal, primary, invalid and disabled', () => {
  const page = gallery()

  expect(page.find('.kit-button.primary').exists()).toBe(true)
  expect(page.findAll('.kit-button:disabled').length).toBeGreaterThanOrEqual(2)
  expect(page.find('.kit-input.invalid').attributes('aria-invalid')).toBe('true')
  expect(page.findAll('.kit-badge').map(badge => badge.classes()[1])).toEqual(['neutral', 'info', 'ok', 'warn', 'error'])
  expect(page.findAll('.kit-toggle:disabled').length).toBe(1)
})

it('says in words why the invalid field is invalid, and links the two', () => {
  const page = gallery()
  const why = page.find('#gallery-why')

  expect(page.find('.kit-input.invalid').attributes('aria-describedby')).toBe('gallery-why')
  expect(why.text()).toContain('not valid')
})

it('shows every icon, with its name', () => {
  const page = gallery()
  const names = page.findAll('.icons li code').map(code => code.text())

  expect(names).toEqual(Object.keys(ICONS))
  expect(page.findAll('.icons svg.icon').length).toBe(names.length)
})

it('shows every colour token', () => {
  const swatches = gallery().findAll('.swatch').map(swatch => swatch.attributes('data-token'))

  expect(swatches).toContain('--color-bg')
  expect(swatches).toContain('--color-border-strong')
  expect(swatches.length).toBeGreaterThanOrEqual(11)
})

it('shows the colours the boards wrote as literals, every size of the type scale, and the hatch', () => {
  const page = gallery()
  const swatches = page.findAll('.swatch').map(swatch => swatch.attributes('data-token'))

  expect(swatches).toEqual(expect.arrayContaining(['--color-text-dim', '--color-on-warn', '--color-on-error', '--color-map']))
  expect(page.findAll('.specimen').map(row => row.attributes('data-size'))).toContain('--font-size-hero')
  expect(page.findAll('.specimen')).toHaveLength(11)
  expect(page.find('.hatch-sample').exists()).toBe(true)
})
