import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Icon from './Icon.vue'
import { ICONS, type IconName } from './icons'

const names = Object.keys(ICONS) as IconName[]

it('has an icon set that is more than a few, each a non-empty path that starts with a move', () => {
  expect(names.length).toBeGreaterThanOrEqual(15)

  for (const name of names) {
    expect(ICONS[name], name).toMatch(/^M[\d.\s-]/u)
  }
})

it('draws each icon as an svg with its path, in the colour of the text, as big as the text', () => {
  for (const name of names) {
    const svg = mount(Icon, { props: { name } }).find('svg')

    expect(svg.find('path').attributes('d'), name).toBe(ICONS[name])
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('width')).toBe('1em')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
  }
})

it('is decoration without a label: hidden from a screen reader, not focusable', () => {
  const svg = mount(Icon, { props: { name: 'check' } }).find('svg')

  expect(svg.attributes('aria-hidden')).toBe('true')
  expect(svg.attributes('role')).toBeUndefined()
  expect(svg.attributes('focusable')).toBe('false')
})

it('is an image with its name when it has a label', () => {
  const svg = mount(Icon, { props: { name: 'warning', label: 'Warning' } }).find('svg')

  expect(svg.attributes('role')).toBe('img')
  expect(svg.attributes('aria-label')).toBe('Warning')
  expect(svg.attributes('aria-hidden')).toBeUndefined()
})

it('keeps every path inside the 24 x 24 grid it is drawn on', () => {
  for (const name of names) {
    // Absolute and relative commands both; the numbers that follow a coordinate command stay within the grid
    // once the pen is placed, so this checks the absolute ones (the capital letters) against the box.
    const commands = [...ICONS[name].matchAll(/[MLHV]\s*(?<numbers>[\d.\s-]+)/gu)]
    const absolute = commands.flatMap(command => (command.groups?.numbers ?? '').trim().split(/\s+/u).map(Number))

    expect(absolute.every(n => n >= 0 && n <= 24), name).toBe(true)
  }
})
