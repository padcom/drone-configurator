// A press anywhere in the open list of a combobox, its scrollbar included, does not take the focus from the field: the list
// stays open for dragging the bar, and the field is left only by a press outside, Tab, Enter or Escape.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import BitField from './BitField.vue'
import { bitOptions } from './bitmask'
import EnumField from './EnumField.vue'
import { withI18n } from './testing'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * Presses the mouse on an element, the way the browser does, and says whether the press was kept from taking the focus.
 *
 * @param element the element
 * @returns true when the default action (the move of the focus) was prevented
 */
function pressedAt(element: Element): boolean {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  element.dispatchEvent(event)

  return event.defaultPrevented
}

it('keeps the list of a field of names open on a press outside its rows (the scrollbar), and closes it on a blur', async () => {
  const options = Array.from({ length: 40 }, (_, value) => ({ value, label: `Name ${value}` }))
  mounted = mount(EnumField, { ...withI18n, props: { modelValue: 1, options, label: 'Value' }, attachTo: document.body })
  await mounted.get('input').trigger('focus')

  expect(pressedAt(mounted.get('[role="listbox"]').element)).toBe(true)
  expect(mounted.find('[role="listbox"]').exists()).toBe(true)
  await mounted.get('input').trigger('blur')
  expect(mounted.find('[role="listbox"]').exists()).toBe(false)
})

it('keeps the list of a field of bits open on a press outside its rows (the scrollbar), and closes it on a blur', async () => {
  const names = Object.fromEntries(Array.from({ length: 32 }, (_, bit) => [bit, `Bit name ${bit}`]))
  mounted = mount(BitField, {
    ...withI18n,
    props: { options: bitOptions(names, 'UINT32'), type: 'UINT32', value: 0, draft: '0', label: 'Value' },
    attachTo: document.body,
  })
  await mounted.get('input').trigger('focus')

  expect(pressedAt(mounted.get('[role="listbox"]').element)).toBe(true)
  expect(mounted.find('[role="listbox"]').exists()).toBe(true)
  await mounted.get('input').trigger('blur')
  expect(mounted.find('[role="listbox"]').exists()).toBe(false)
  expect(mounted.emitted('settle')).toHaveLength(1)
})
