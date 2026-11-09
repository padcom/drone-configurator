import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import SplitPane from './SplitPane.vue'
import Tabs from './Tabs.vue'

let mounted: VueWrapper | undefined

/**
 * Mounts a control in the document (focus needs it to be there).
 *
 * @param component the control
 * @param options props and slots
 * @returns the wrapper
 */
function put(component: Parameters<typeof mount>[0], options: Parameters<typeof mount>[1] = {}): VueWrapper {
  mounted = mount(component, { ...options, attachTo: document.body })

  return mounted
}

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

// ---- SegmentedControl

const MODES = [{ value: 'udp', label: 'UDP' }, { value: 'tcp', label: 'TCP' }, { value: 'serial', label: 'Serial' }]

it('has a segmented control that is a group of native radio buttons with a name', () => {
  const control = put(SegmentedControl, { props: { label: 'Transport', options: MODES, modelValue: 'tcp' } })
  const radios = control.findAll<HTMLInputElement>('input[type="radio"]')

  expect(control.attributes('role')).toBe('radiogroup')
  expect(control.attributes('aria-label')).toBe('Transport')
  expect(radios.map(radio => radio.element.checked)).toEqual([false, true, false])
  expect(control.findAll('.segment').map(segment => segment.text())).toEqual(['UDP', 'TCP', 'Serial'])
  expect(new Set(radios.map(radio => radio.attributes('name'))).size).toBe(1)
})

it('chooses a segment, and can be turned off', async () => {
  const control = put(SegmentedControl, { props: { label: 'Transport', options: MODES, modelValue: 'udp' } })

  await control.findAll('input')[2]?.setValue(true)
  expect(control.emitted('update:modelValue')).toEqual([['serial']])

  await control.setProps({ disabled: true })
  expect(control.findAll('input').every(radio => radio.attributes('disabled') !== undefined)).toBe(true)
})

// ---- Tabs

const TABS = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }]

/**
 * Tabs with a slot for each panel.
 *
 * @param modelValue the chosen tab
 * @returns the wrapper
 */
function tabsAt(modelValue: string): VueWrapper {
  return put(Tabs, {
    props: { label: 'Settings', tabs: TABS, modelValue },
    slots: { one: 'First panel', two: 'Second panel', three: 'Third panel' },
  })
}

it('has tabs with the roles and the links between a tab and its panel', () => {
  const tabs = tabsAt('two')
  const tab = tabs.findAll('[role="tab"]')
  const panel = tabs.findAll('[role="tabpanel"]')

  expect(tabs.find('[role="tablist"]').attributes('aria-label')).toBe('Settings')
  expect(tab.map(t => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
  expect(tab.map(t => t.attributes('aria-controls'))).toEqual(panel.map(p => p.attributes('id')))
  expect(panel.map(p => p.attributes('aria-labelledby'))).toEqual(tab.map(t => t.attributes('id')))
})

it('puts only the chosen tab in the tab order, and shows only its panel (the others are kept)', () => {
  const tabs = tabsAt('two')

  expect(tabs.findAll('[role="tab"]').map(t => t.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
  expect(tabs.findAll('[role="tabpanel"]').map(p => p.attributes('hidden') === undefined)).toEqual([false, true, false])
  expect(tabs.text()).toContain('First panel')
})

it('chooses a tab that is clicked', async () => {
  const tabs = tabsAt('one')

  await tabs.findAll('[role="tab"]')[2]?.trigger('click')

  expect(tabs.emitted('update:modelValue')).toEqual([['three']])
})

it('moves between tabs with the arrow keys, wrapping round, and chooses the one it lands on', async () => {
  const tabs = tabsAt('one')
  const [first] = tabs.findAll('[role="tab"]')

  await first?.trigger('keydown', { key: 'ArrowLeft' })
  await first?.trigger('keydown', { key: 'ArrowRight' })

  expect(tabs.emitted('update:modelValue')).toEqual([['three'], ['two']])
})

it('goes to the last tab with End, and moves the focus with it', async () => {
  const tabs = tabsAt('two')
  const [, second, third] = tabs.findAll('[role="tab"]')

  await second?.trigger('keydown', { key: 'End' })

  expect(tabs.emitted('update:modelValue')).toEqual([['three']])
  expect(document.activeElement).toBe(third?.element)
})

it('goes to the first tab with Home, and moves the focus with it', async () => {
  const tabs = tabsAt('two')
  const [first, second] = tabs.findAll('[role="tab"]')

  await second?.trigger('keydown', { key: 'Home' })

  expect(tabs.emitted('update:modelValue')).toEqual([['one']])
  expect(document.activeElement).toBe(first?.element)
})

it('ignores the keys that are not for tabs', async () => {
  const tabs = tabsAt('one')

  await tabs.findAll('[role="tab"]')[0]?.trigger('keydown', { key: 'a' })

  expect(tabs.emitted('update:modelValue')).toBeUndefined()
})

// ---- SplitPane

/**
 * A split pane whose box is 1000 x 500 pixels from (100, 50), as a browser would have laid it out.
 *
 * @param props what to set
 * @returns the wrapper
 */
function splitWith(props: Record<string, unknown> = {}): VueWrapper {
  const split = put(SplitPane, {
    props: { label: 'Resize the panes', modelValue: 50, ...props },
    slots: { first: 'Left', second: 'Right' },
  })
  split.element.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 500 }) as DOMRect

  return split
}

it('has a split pane with a separator that says how big the first pane is', () => {
  const split = splitWith({ modelValue: 30 })
  const bar = split.find('[role="separator"]')

  expect(bar.attributes('aria-valuenow')).toBe('30')
  expect(bar.attributes('aria-valuemin')).toBe('10')
  expect(bar.attributes('aria-valuemax')).toBe('90')
  expect(bar.attributes('aria-label')).toBe('Resize the panes')
  expect(bar.attributes('tabindex')).toBe('0')
  expect(split.attributes('style')).toContain('--split: 30%')
  expect(split.text()).toContain('Left')
  expect(split.text()).toContain('Right')
})

it('has a separator across the split: vertical between panes side by side, horizontal between stacked ones', () => {
  expect(splitWith().find('[role="separator"]').attributes('aria-orientation')).toBe('vertical')
  expect(splitWith({ direction: 'column' }).find('[role="separator"]').attributes('aria-orientation')).toBe('horizontal')
})

it('moves the bar by 5 % with the arrow keys across the split, and not with the others', async () => {
  const row = splitWith()
  const bar = row.find('[role="separator"]')

  await bar.trigger('keydown', { key: 'ArrowRight' })
  await bar.trigger('keydown', { key: 'ArrowLeft' })
  await bar.trigger('keydown', { key: 'ArrowUp' })
  // The pane keeps the size it was last given while the parent holds the old one: 55, then 5 % back from there.
  expect(row.emitted('update:modelValue')).toEqual([[55], [50]])

  const column = splitWith({ direction: 'column' })
  await column.find('[role="separator"]').trigger('keydown', { key: 'ArrowDown' })
  await column.find('[role="separator"]').trigger('keydown', { key: 'ArrowRight' })
  expect(column.emitted('update:modelValue')).toEqual([[55]])
})

it('keeps the first pane between the smallest and the largest size', async () => {
  const split = splitWith({ modelValue: 88, min: 20, max: 90 })
  const bar = split.find('[role="separator"]')

  await bar.trigger('keydown', { key: 'ArrowRight' })
  await bar.trigger('keydown', { key: 'Home' })
  await bar.trigger('keydown', { key: 'End' })

  expect(split.emitted('update:modelValue')).toEqual([[90], [20], [90]])
})

/**
 * Sends the bar a pointer event at a place (test-utils cannot set a mouse event's coordinates, so it is built here).
 *
 * @param bar the separator
 * @param type `pointerdown`, `pointermove` or `pointerup`
 * @param at the pointer's coordinates
 * @param at.clientX across the page
 * @param at.clientY down the page
 */
async function point(bar: ReturnType<VueWrapper['find']>, type: string, at: { clientX?: number, clientY?: number } = {}) {
  bar.element.dispatchEvent(new MouseEvent(type, { ...at, bubbles: true }))
  await nextTick()
}

it('follows the pointer while the bar is dragged, and stops when it is let go', async () => {
  const split = splitWith()
  const bar = split.find('[role="separator"]')

  await point(bar, 'pointerdown', { clientX: 600 })
  expect(bar.classes()).toContain('dragging')
  await point(bar, 'pointermove', { clientX: 350 })
  await point(bar, 'pointermove', { clientX: 5000 })
  await point(bar, 'pointermove', { clientX: 0 })
  await point(bar, 'pointerup')
  await point(bar, 'pointermove', { clientX: 600 })

  // (350 - 100) / 1000 = 25 %; the far right and the far left are held at the largest and the smallest.
  expect(split.emitted('update:modelValue')).toEqual([[25], [90], [10]])
  expect(bar.classes()).not.toContain('dragging')
})

it('follows the pointer up and down in a split that is stacked', async () => {
  const split = splitWith({ direction: 'column', modelValue: 20 })
  const bar = split.find('[role="separator"]')

  await point(bar, 'pointerdown', { clientY: 300 })
  await point(bar, 'pointermove', { clientY: 300 })

  // (300 - 50) / 500 = 50 %: the vertical position counts in a stacked split (the horizontal one did in the other).
  expect(split.emitted('update:modelValue')).toEqual([[50]])
})
