import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { h } from 'vue'
import Banner from './Banner.vue'
import EmptyState from './EmptyState.vue'
import Panel from './Panel.vue'
import ProgressBar from './ProgressBar.vue'
import SectionLabel from './SectionLabel.vue'
import StatCell from './StatCell.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * Mounts a component and keeps it for clean-up.
 *
 * @param component the component
 * @param options its props, slots and attributes
 * @returns the wrapper
 */
function put(component: Parameters<typeof mount>[0], options: Record<string, unknown> = {}): VueWrapper {
  mounted = mount(component, { attachTo: document.body, ...options }) as VueWrapper

  return mounted
}

describe('a panel', () => {
  it('is a section with its content, and a div, an aside or an article when it says', () => {
    expect(put(Panel, { slots: { default: 'In it' } }).html()).toContain('<section class="kit-panel">In it</section>')
    expect(put(Panel, { props: { tag: 'aside' } }).element.tagName).toBe('ASIDE')
  })

  it('has less room when it is compact, and takes an aria-label for a region', () => {
    const panel = put(Panel, { props: { compact: true }, attrs: { 'aria-label': 'Battery' } })

    expect(panel.classes()).toEqual(['kit-panel', 'compact'])
    expect(panel.attributes('aria-label')).toBe('Battery')
  })
})

describe('a section label', () => {
  it('is a heading of level 2 unless it says, with its words as written (the capitals are drawn by the stylesheet)', () => {
    const label = put(SectionLabel, { slots: { default: 'Messages' } })

    expect(label.element.tagName).toBe('H2')
    expect(label.text()).toBe('Messages')
    expect(put(SectionLabel, { props: { level: 3 } }).element.tagName).toBe('H3')
  })
})

describe('a stat cell', () => {
  it('has its label and its value, and a tone only when it is asked for', () => {
    const cell = put(StatCell, { props: { label: 'Mode' }, slots: { default: 'LOITER' } })

    expect([cell.get('.label').text(), cell.get('.value').text()]).toEqual(['Mode', 'LOITER'])
    expect(cell.classes()).toEqual(['kit-stat', 'default'])
    expect(put(StatCell, { props: { label: 'State', tone: 'warn' } }).classes()).toContain('warn')
  })
})

describe('a banner', () => {
  it('is a status, read out politely, with an icon and its words', () => {
    const banner = put(Banner, { props: { tone: 'warn' }, slots: { default: 'Reboot to use it' } })

    expect(banner.attributes('role')).toBe('status')
    expect(banner.find('svg.icon').exists()).toBe(true)
    expect(banner.text()).toContain('Reboot to use it')
    expect(banner.classes()).not.toContain('urgent')
  })

  it('is an alert, read out at once and filled, when it is urgent', () => {
    const banner = put(Banner, { props: { tone: 'error', urgent: true }, slots: { default: 'Failsafe: battery' } })

    expect(banner.attributes('role')).toBe('alert')
    expect(banner.classes()).toEqual(expect.arrayContaining(['kit-banner', 'error', 'urgent']))
  })

  it.each(['info', 'warn', 'error'] as const)('is an alert when it is urgent, in the %s tone too', tone => {
    expect(put(Banner, { props: { tone, urgent: true } }).attributes('role')).toBe('alert')
  })

  it('has its actions beside the words, and none when there are none', () => {
    const none = put(Banner, { slots: { default: 'Saved' } })
    const some = put(Banner, { slots: { default: 'Saved', actions: () => h('button', 'Undo') } })

    expect([none.find('.actions').exists(), some.find('.actions button').text()]).toEqual([false, 'Undo'])
  })
})

describe('a progress bar', () => {
  it('says how far it is to a screen reader, from 0 to 100', () => {
    const bar = put(ProgressBar, { props: { value: 0.4, label: 'Downloading parameters' } })

    expect(bar.attributes()).toMatchObject({
      'role': 'progressbar',
      'aria-label': 'Downloading parameters',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '40',
    })
  })

  it.each([[-1, '0'], [2, '100'], [Number.NaN, '0'], [0.456, '46']])('holds %s to %s percent', (value, percent) => {
    expect(put(ProgressBar, { props: { value, label: 'x' } }).attributes('aria-valuenow')).toBe(percent)
  })
})

describe('an empty state', () => {
  it('says what is missing and what it takes, with the one action when there is one', () => {
    const props = { title: 'No parameters yet', help: 'Connect a vehicle.' }
    const empty = put(EmptyState, { props, slots: { default: () => h('button', 'Connect') } })

    expect(empty.get('h3').text()).toBe('No parameters yet')
    expect(empty.get('.help').text()).toBe('Connect a vehicle.')
    expect(empty.get('.actions button').text()).toBe('Connect')
  })

  it('has its heading at the level it is asked for, level 3 unless said', () => {
    const props = { title: 'Nothing', help: 'Wait.' }

    expect(put(EmptyState, { props }).element.querySelector('h3')).not.toBeNull()
    expect(put(EmptyState, { props: { ...props, level: 2 } }).element.querySelector('h2')).not.toBeNull()
  })

  it('has no actions area without an action', () => {
    expect(put(EmptyState, { props: { title: 'Nothing', help: 'Wait.' } }).find('.actions').exists()).toBe(false)
  })
})
