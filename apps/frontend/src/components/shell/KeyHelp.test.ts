// The keys in the shell: F1 opens the help of the keys (by screen, as the user has them), a key the user chose works and the
// old one no longer does, and the help command is in the palette with its key.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import Shell from './Shell.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { KEY_BINDINGS_KEY, forgetKeyBindingChoice } from '@/composables/useKeyBindings'
import { useKeyHelp } from '@/composables/useKeyHelp'
import { setBindings } from '@/lib/app/keymap'

let mounted: VueWrapper | undefined

/**
 * The shell on settings that hold these entries.
 *
 * @param ui the entries
 * @returns the mounted shell
 */
async function shell(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return mounted
}

/**
 * A key press on the page, as the browser sends it.
 *
 * @param init what the event has
 * @returns the event
 */
function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  document.body.dispatchEvent(event)

  return event
}

afterEach(() => {
  setLanguage('en')
  useCommandPalette().hide()
  useKeyHelp().hide()
  mounted?.unmount()
  mounted = undefined
  forgetKeyBindingChoice()
  setBindings({})
  document.body.innerHTML = ''
})

it('opens the help of the keys on F1, with the keys by screen, and closes it with its button', async () => {
  const wrapper = await shell()
  const event = press({ code: 'F1' })
  await flushPromises()

  expect(event.defaultPrevented).toBe(true)
  expect(wrapper.get('.keys-list').text()).toContain('Open the command palette')
  expect(wrapper.text()).toContain('Ctrl P')
  expect(wrapper.findAll('.keys-group h3').map(heading => heading.text())).toEqual(['Whole window', 'Parameters'])
  await wrapper.get('#keys-close').trigger('click')
  await flushPromises()
  expect(wrapper.find('.keys-list').exists()).toBe(false)
})

it('has the key the user chose, and not the one it had', async () => {
  const wrapper = await shell([{ key: KEY_BINDINGS_KEY, value: '{"palette.open": {"code": "KeyK", "ctrl": true}}' }])
  press({ code: 'KeyP', key: 'p', ctrlKey: true })
  await flushPromises()
  expect(wrapper.find('#palette-input').exists()).toBe(false)

  const event = press({ code: 'KeyK', key: 'k', ctrlKey: true })
  await flushPromises()

  expect(event.defaultPrevented).toBe(true)
  expect(wrapper.find('#palette-input').exists()).toBe(true)
})

it('shows the help with the keys as chosen, and does nothing on a key that was taken off', async () => {
  const wrapper = await shell([{ key: KEY_BINDINGS_KEY, value: '{"help.keys": {"code": "F2"}, "palette.open": null}' }])
  press({ code: 'F1' })
  press({ code: 'KeyP', key: 'p', ctrlKey: true })
  await flushPromises()
  expect(wrapper.find('.keys-list').exists()).toBe(false)
  expect(wrapper.find('#palette-input').exists()).toBe(false)

  press({ code: 'F2' })
  await flushPromises()
  expect(wrapper.get('.keys-list').text()).toContain('F2')
  expect(wrapper.get('.keys-list').text()).not.toContain('Open the command palette')
})

it('does not run a command on a held key (it runs once)', async () => {
  const wrapper = await shell()
  press({ code: 'F1', repeat: true })
  await flushPromises()

  expect(wrapper.find('.keys-list').exists()).toBe(false)
})
