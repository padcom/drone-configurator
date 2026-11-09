import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import FlightData from './screens/FlightData.vue'
import { mockBackend } from './mock-backend'
import { withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  const active = document.activeElement as HTMLElement | null
  active?.blur()
})

/**
 * The Flight data screen on a fresh Configurator.
 *
 * @returns the mounted screen
 */
async function screen(): Promise<VueWrapper> {
  createConfigurator(mockBackend())
  mounted = mount(FlightData, { ...withI18n, attachTo: document.body })
  await flushPromises()

  return mounted
}

/**
 * Presses a key in the window, as the keyboard does (the screen listens to the window, so F6 works from anywhere).
 *
 * @param key the key
 * @param modifiers Shift, Alt and the like
 * @returns whether nobody called preventDefault (true: the key was not taken)
 */
function press(key: string, modifiers: KeyboardEventInit = {}): boolean {
  return window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }))
}

/**
 * The title of an element, if it is a pane.
 *
 * @param element anything
 * @returns the pane's title, or undefined
 */
function titleOf(element: Element | null): string | undefined {
  return element?.classList.contains('flight-pane') ? element.querySelector('h2')?.textContent : undefined
}

/**
 * The name of the pane that has the focus, or what else has it.
 *
 * @returns `Map`, `Display` or `Details`; or the tag of what has the focus
 */
function focused(): string {
  return titleOf(document.activeElement) ?? document.activeElement?.tagName ?? 'nothing'
}

it('has the panes in the order the keys go through them, and not in the tab order', async () => {
  const wrapper = await screen()

  expect(wrapper.findAll('.flight-pane').map(pane => pane.attributes('tabindex'))).toEqual(['-1', '-1', '-1'])
  expect(wrapper.findAll('.flight-pane h2').map(title => title.text())).toEqual(['Map', 'Display', 'Details'])
})

it('moves the focus to the next pane with F6, and round to the first after the last', async () => {
  await screen()

  const taken = [press('F6'), press('F6'), press('F6'), press('F6')]

  expect(taken).toEqual([false, false, false, false])
  expect(focused()).toBe('Map')
  press('F6')
  expect(focused()).toBe('Display')
})

it('goes the other way with Shift+F6, starting at the last pane', async () => {
  await screen()

  press('F6', { shiftKey: true })
  expect(focused()).toBe('Details')
  press('F6', { shiftKey: true })
  expect(focused()).toBe('Display')
  press('F6', { shiftKey: true })
  press('F6', { shiftKey: true })
  expect(focused()).toBe('Details')
})

it('moves on from a pane whose button has the focus, to the next pane', async () => {
  const wrapper = await screen()
  const button = wrapper.findAll('button.toggle')[1]!.element as HTMLElement
  button.focus()

  press('F6')

  expect(focused()).toBe('Details')
})

it('also moves on from a pane that is collapsed, and onto one', async () => {
  const wrapper = await screen()
  await wrapper.findAll('button.toggle')[1]!.trigger('click')

  press('F6')
  press('F6')

  expect(focused()).toBe('Display')
  expect(wrapper.findAll('.flight-pane')[1]!.classes()).toContain('collapsed')
})

it('leaves the keys with Alt, Ctrl or Meta to the system, and the other function keys alone', async () => {
  await screen()

  const taken = [press('F6', { altKey: true }), press('F6', { ctrlKey: true }), press('F6', { metaKey: true }), press('F5')]

  expect(taken).toEqual([true, true, true, true])
  expect(focused()).toBe('BODY')
})

it('stops taking the key when the screen is gone', async () => {
  await screen()
  mounted?.unmount()
  mounted = undefined

  expect(press('F6')).toBe(true)
  expect(focused()).toBe('BODY')
})
