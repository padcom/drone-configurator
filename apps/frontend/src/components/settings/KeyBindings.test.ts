// The keys in Settings: every action with its key, the key chosen by pressing it, what stands in the way (a chord that is not
// to be used, one that another action has, which may be taken over), back to the defaults, the choice kept in the settings, and
// no key doing its command while a key is being chosen.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { KEY_BINDINGS_KEY, forgetKeyBindingChoice } from '@/composables/useKeyBindings'
import { i18n, setLanguage } from '@/i18n/i18n'
import { matches, setBindings } from '@/lib/app/keymap'
import { mockBackend } from '@/mock/mock-backend'
import KeyBindings from './KeyBindings.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  setLanguage('en')
  forgetKeyBindingChoice()
  setBindings({})
})

/**
 * The group over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the group and the Configurator
 */
async function group(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(KeyBindings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Presses a key on the window.
 *
 * @param init what the press has
 */
async function press(init: KeyboardEventInit): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }))
  await flushPromises()
}

/**
 * The text of the row of an action.
 *
 * @param wrapper the group
 * @param actionId the action
 * @returns the key it shows
 */
function keyOf(wrapper: VueWrapper, actionId: string): string {
  return wrapper.get(`[id="keys-change-${actionId}"]`).element.closest('.keys-row')?.querySelector('kbd')?.textContent ?? ''
}

it('lists every action with its key, and a key that is fixed without a button to change it', async () => {
  const { wrapper } = await group()

  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl P')
  expect(keyOf(wrapper, 'panes.previous')).toBe('Shift F6')
  expect(wrapper.findAll('.keys-row')).toHaveLength(6)
  expect(wrapper.find('[id="keys-change-params.search"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('cannot be changed')
})

it('gives an action the key that is pressed next, keeps it in the settings, and shows it at once', async () => {
  const { wrapper, handle } = await group()

  await wrapper.get('[id="keys-change-palette.open"]').trigger('click')
  expect(wrapper.get('[id="keys-press-palette.open"]').text()).toContain('Press the new key')
  await press({ code: 'KeyK', ctrlKey: true })

  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl K')
  expect(JSON.parse(handle.settings.uiValue(KEY_BINDINGS_KEY) ?? '{}')).toEqual({
    'palette.open': { code: 'KeyK', ctrl: true, shift: false },
  })
  expect(matches(new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true }), 'palette.open', false)).toBe(true)
  expect(wrapper.find('[id="keys-press-palette.open"]').exists()).toBe(false)
})

it('does not let a key do its command while a key is being chosen, and again once it is done or given up', async () => {
  const { wrapper } = await group()
  const palette = () => matches(new KeyboardEvent('keydown', { code: 'KeyP', ctrlKey: true }), 'palette.open', false)

  expect(palette()).toBe(true)
  await wrapper.get('[id="keys-change-help.keys"]').trigger('click')
  expect(palette()).toBe(false)
  await press({ code: 'Escape' })
  expect(palette()).toBe(true)
  expect(wrapper.find('[id="keys-press-help.keys"]').exists()).toBe(false)
})

it('refuses a chord that may not be used, and says why', async () => {
  const { wrapper } = await group()

  await wrapper.get('[id="keys-change-palette.open"]').trigger('click')
  await press({ code: 'KeyW', ctrlKey: true })
  expect(wrapper.get('[id="keys-refused-palette.open"]').text()).toContain('system or the browser')
  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl P')

  await wrapper.get('[id="keys-change-palette.open"]').trigger('click')
  await press({ code: 'KeyK' })
  expect(wrapper.get('[id="keys-refused-palette.open"]').text()).toContain('typed in text')
})

it('names the action that has the chord, changes nothing, and takes the chord over when asked', async () => {
  const { wrapper } = await group()

  await wrapper.get('[id="keys-change-help.keys"]').trigger('click')
  await press({ code: 'KeyP', ctrlKey: true })
  expect(wrapper.get('[id="keys-clash-help.keys"]').text()).toContain('Open the command palette')
  expect(keyOf(wrapper, 'help.keys')).toBe('F1')

  await wrapper.get('[id="keys-take-help.keys"]').trigger('click')
  await flushPromises()
  expect(keyOf(wrapper, 'help.keys')).toBe('Ctrl P')
  expect(keyOf(wrapper, 'palette.open')).toBe('No key')
  expect(wrapper.find('[id="keys-clash-help.keys"]').exists()).toBe(false)
})

it('keeps the old key when the chord is not taken over', async () => {
  const { wrapper } = await group()

  await wrapper.get('[id="keys-change-help.keys"]').trigger('click')
  await press({ code: 'KeyP', ctrlKey: true })
  await wrapper.get('[id="keys-keep-help.keys"]').trigger('click')

  expect(keyOf(wrapper, 'help.keys')).toBe('F1')
  expect(wrapper.find('[id="keys-clash-help.keys"]').exists()).toBe(false)
})

it('puts a key, and then every key, back to its default', async () => {
  const { wrapper, handle } = await group([
    { key: KEY_BINDINGS_KEY, value: JSON.stringify({ 'palette.open': { code: 'KeyK', ctrl: true }, 'help.keys': null }) },
  ])

  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl K')
  expect(keyOf(wrapper, 'help.keys')).toBe('No key')
  await wrapper.get('[id="keys-reset-palette.open"]').trigger('click')
  await flushPromises()
  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl P')

  await wrapper.get('#keys-reset-all').trigger('click')
  await flushPromises()
  expect(keyOf(wrapper, 'help.keys')).toBe('F1')
  expect(JSON.parse(handle.settings.uiValue(KEY_BINDINGS_KEY) ?? '{}')).toEqual({})
})

it.each([
  ['the window loses the focus', () => window.dispatchEvent(new Event('blur'))],
  ['the pointer is pressed somewhere', () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))],
])('gives up waiting for a key when %s, so a later key is not kept as the choice', async (_name, event) => {
  const { wrapper } = await group()

  await wrapper.get('[id="keys-change-palette.open"]').trigger('click')
  event()
  await flushPromises()
  expect(wrapper.find('[id="keys-press-palette.open"]').exists()).toBe(false)

  await press({ code: 'KeyK', ctrlKey: true })
  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl P')
})

it('gives up waiting for a key after a while', async () => {
  const { wrapper } = await group()
  vi.useFakeTimers()

  try {
    await wrapper.get('[id="keys-change-palette.open"]').trigger('click')
    vi.advanceTimersByTime(10_001)
    await flushPromises()
    expect(wrapper.find('[id="keys-press-palette.open"]').exists()).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

it('refuses what Ctrl does to text (Ctrl+Backspace), so it is not taken from the text fields', async () => {
  const { wrapper } = await group()

  await wrapper.get('[id="keys-change-palette.open"]').trigger('click')
  await press({ code: 'Backspace', ctrlKey: true })

  expect(wrapper.get('[id="keys-refused-palette.open"]').text()).toContain('system or the browser')
  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl P')
})

it('takes what is not a choice in the settings for the defaults', async () => {
  const { wrapper } = await group([{ key: KEY_BINDINGS_KEY, value: '{"palette.open": {"code": "KeyW", "ctrl": true}}' }])

  expect(keyOf(wrapper, 'palette.open')).toBe('Ctrl P')
})
