// Ctrl+/ (to the search) and Ctrl+Enter (press Write from the Value field or the list), on a small page that has the places.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useParamShortcuts } from './paramShortcuts'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

/**
 * A screen with the shortcuts, the search, a Value field, a list, a Write button, and a dialog with a text field.
 *
 * @param write the spy the Write button calls
 * @param disabled whether the Write button is off
 * @returns the spy for what the Value field queues
 */
function screen(write = vi.fn(), disabled = false) {
  const sync = vi.fn()
  wrapper = mount(defineComponent({
    setup() {
      useParamShortcuts({ sync })

      return () => h('div', [
        h('input', { id: 'filter' }),
        h('form', { id: 'edit' }, [h('input', { id: 'draft' })]),
        h('table', { id: 'param-list', tabindex: 0 }),
        h('button', { id: 'write-staged', disabled, onClick: write }),
        h('dialog', { open: true }, [h('input', { id: 'in-dialog' })]),
        h('button', { id: 'elsewhere' }),
      ])
    },
  }), { attachTo: document.body })

  return sync
}

/**
 * Presses a key on an element of the page.
 *
 * @param id the element
 * @param key the key
 * @param more the modifiers
 * @returns the event, to see whether it was stopped
 */
function press(id: string, key: string, more: KeyboardEventInit = { ctrlKey: true }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...more });
  (document.getElementById(id) ?? document.body).dispatchEvent(event)

  return event
}

it('goes to the search on Ctrl+/ from anywhere on the screen, and keeps the key from the browser', () => {
  screen()

  const event = press('elsewhere', '/')

  expect(document.activeElement?.id).toBe('filter')
  expect(event.defaultPrevented).toBe(true)
})

it('leaves Ctrl+/ alone in a text field of a dialog', () => {
  screen()

  const event = press('in-dialog', '/')

  expect(document.activeElement?.id).not.toBe('filter')
  expect(event.defaultPrevented).toBe(false)
})

it.each(['draft', 'param-list'])('queues the value and presses Write on Ctrl+Enter in %s', async id => {
  const write = vi.fn()
  const sync = screen(write)

  const event = press(id, 'Enter')
  await flushPromises()

  expect(sync).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledTimes(1)
  expect(event.defaultPrevented).toBe(true)
})

it('does nothing on Ctrl+Enter anywhere else, or on Enter, or on Ctrl+Shift+Enter in the field', async () => {
  const write = vi.fn()
  screen(write)

  press('elsewhere', 'Enter')
  press('in-dialog', 'Enter')
  press('draft', 'Enter', {})
  press('draft', 'Enter', { ctrlKey: true, shiftKey: true })
  await flushPromises()

  expect(write).not.toHaveBeenCalled()
})

it('writes nothing when the Write button is off (nothing queued): a disabled button ignores the press', async () => {
  const write = vi.fn()
  screen(write, true)

  press('draft', 'Enter')
  await flushPromises()

  expect(write).not.toHaveBeenCalled()
})

it('goes to the search on Ctrl+Shift+7 of a layout where / needs Shift (the key is `/`), but not Ctrl+Shift+Enter', () => {
  screen()

  const event = press('elsewhere', '/', { ctrlKey: true, shiftKey: true })

  expect(document.activeElement?.id).toBe('filter')
  expect(event.defaultPrevented).toBe(true)
})

it('writes once for a Ctrl+Enter that is held down: the repeats do nothing, and are kept from the field', async () => {
  const write = vi.fn()
  screen(write)

  press('draft', 'Enter')
  const repeat = press('draft', 'Enter', { ctrlKey: true, repeat: true })
  await flushPromises()

  expect(write).toHaveBeenCalledTimes(1)
  expect(repeat.defaultPrevented).toBe(true)
})

it('stops listening when the screen goes', () => {
  screen()
  wrapper?.unmount()
  wrapper = undefined

  const event = press('elsewhere', '/')

  expect(event.defaultPrevented).toBe(false)
})
