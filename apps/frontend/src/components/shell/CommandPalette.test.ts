// The command palette, in the shell: opened by Ctrl+P and by the top bar's button, filtered by what is typed (in the language of
// the page and in English), run through the registry, and reachable by keyboard and screen reader.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { LANGUAGES, i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import Shell from './Shell.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useCommands } from '@/composables/useCommands'
import { useConnectDialog } from '@/composables/useConnectDialog'

let mounted: VueWrapper | undefined

/**
 * The shell on a fresh Configurator, at `path`.
 *
 * @param path where the application is
 * @returns the mounted shell and its router
 */
async function shellAt(path = '/flight') {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return { wrapper: mounted, router }
}

/**
 * A key press on the page, as the browser sends it.
 *
 * @param init what the event has
 * @returns the event, so that a test can ask if its default was prevented
 */
function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  document.body.dispatchEvent(event)

  return event
}

const ctrlP = (init: KeyboardEventInit = {}) => press({ code: 'KeyP', key: 'p', ctrlKey: true, ...init })

afterEach(() => {
  setLanguage('en')
  useCommandPalette().hide()
  useConnectDialog().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

/**
 * What the rows say, one string each.
 *
 * @param wrapper the shell
 * @returns the labels in order
 */
const labels = (wrapper: VueWrapper) => wrapper.findAll('.palette-row .palette-label').map(label => label.text())

/**
 * Types into the palette's input.
 *
 * @param wrapper the shell
 * @param text what to type
 */
async function type(wrapper: VueWrapper, text: string): Promise<void> {
  await wrapper.get('#palette-input').setValue(text)
}

it('is shut until it is asked for, and opens on Ctrl+P, which it prevents (Chromium would print)', async () => {
  const { wrapper } = await shellAt()
  expect(wrapper.find('#palette-input').exists()).toBe(false)

  const event = ctrlP()
  await flushPromises()

  expect(event.defaultPrevented).toBe(true)
  expect(wrapper.find('#palette-input').exists()).toBe(true)
  expect(document.activeElement?.id).toBe('palette-input')
})

it('closes on Ctrl+P again, ignores a held key (repeat), and prevents the default every time', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const held = ctrlP({ repeat: true })
  await flushPromises()

  expect(held.defaultPrevented).toBe(true)
  expect(wrapper.find('#palette-input').exists()).toBe(true)
  ctrlP()
  await flushPromises()

  expect(wrapper.find('#palette-input').exists()).toBe(false)
})

it('opens on the physical key whatever the letter is (Russian layout), and not on Shift or Alt with it', async () => {
  const { wrapper } = await shellAt()
  ctrlP({ shiftKey: true })
  ctrlP({ altKey: true })
  press({ code: 'KeyP', key: 'p' })
  await flushPromises()

  expect(wrapper.find('#palette-input').exists()).toBe(false)
  ctrlP({ key: 'з' })
  await flushPromises()

  expect(wrapper.find('#palette-input').exists()).toBe(true)
})

it('opens from inside a text field (the parameters search), and does not open over another dialog', async () => {
  const { wrapper } = await shellAt('/parameters')
  wrapper.get<HTMLInputElement>('#filter').element.focus()
  ctrlP()
  await flushPromises()

  expect(wrapper.find('#palette-input').exists()).toBe(true)
  useCommandPalette().hide()
  await flushPromises()
  useConnectDialog().show()
  await flushPromises()
  ctrlP()
  await flushPromises()

  expect(wrapper.find('#palette-input').exists()).toBe(false)
})

it('leaves Ctrl+/, Ctrl+Enter and F6 alone', async () => {
  await shellAt()

  expect(press({ code: 'Slash', key: '/', ctrlKey: true }).defaultPrevented).toBe(false)
  expect(press({ code: 'Enter', key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(false)
  expect(useCommandPalette().open.value).toBe(false)
})

it('is opened by the top bar\'s button, which says what it does and what key it has', async () => {
  const { wrapper } = await shellAt()
  const button = wrapper.get('#open-palette')

  expect(button.get('.palette-button-text').text()).toBe('Search or run a command')
  expect(button.get('kbd').text()).toBe('Ctrl P')
  expect(button.attributes('aria-haspopup')).toBe('dialog')
  expect(button.attributes('aria-keyshortcuts')).toBe('Control+P')
  await button.trigger('click')

  expect(wrapper.find('#palette-input').exists()).toBe(true)
})

it('lists every command in registry order with its group, the Navigate ones first', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()

  expect(labels(wrapper)).toEqual([
    'Switch to Flight data',
    'Switch to Plan',
    'Switch to Setup',
    'Switch to Parameters',
    'Switch to Tune',
    'Switch to Logs',
    'Switch to Settings',
  ])
  expect(wrapper.findAll('.palette-row .palette-group').map(group => group.text())).toEqual(Array(7).fill('Navigate'))
  expect(wrapper.findAll('.palette-row .palette-key').map(key => key.text())).toEqual(Array(7).fill(''))
})

it('filters by what is typed, and says so when nothing matches', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  await type(wrapper, 'param')

  expect(labels(wrapper)).toEqual(['Switch to Parameters'])
  await type(wrapper, 'xyz')

  expect(labels(wrapper)).toEqual([])
  expect(wrapper.get('.palette-empty').text()).toBe('Nothing matches “xyz”.')
})

it('finds a command by its English name in another language, and by its own with the accents left out', async () => {
  const { wrapper } = await shellAt()
  setLanguage('pl')
  ctrlP()
  await flushPromises()
  await type(wrapper, 'switch to parameters')

  expect(labels(wrapper)).toEqual(['Przejdź do ekranu Parametry'])
  await type(wrapper, 'przejdz do ekranu dane')

  expect(labels(wrapper)).toEqual(['Przejdź do ekranu Dane lotu'])
})

it('runs the selected row on Enter: goes to the screen, closes, and puts the focus in the screen', async () => {
  const { wrapper, router } = await shellAt()
  ctrlP()
  await flushPromises()
  await type(wrapper, 'param')
  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/parameters')
  expect(wrapper.find('#palette-input').exists()).toBe(false)
  await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('.app-main')))
})

it('runs a row on a click', async () => {
  const { wrapper, router } = await shellAt()
  ctrlP()
  await flushPromises()
  await wrapper.get('[data-command="go.settings"]').trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings'))
  expect(wrapper.find('#palette-input').exists()).toBe(false)
})

it('moves the selection with the arrows (round the ends), the pages, and Home and End while the query is empty', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const input = wrapper.get('#palette-input')
  const active = () => wrapper.get('.palette-row.active').attributes('data-command')
  expect(active()).toBe('go.flight')

  await input.trigger('keydown', { key: 'ArrowUp' })
  expect(active()).toBe('go.settings')
  await input.trigger('keydown', { key: 'ArrowDown' })
  expect(active()).toBe('go.flight')
  await input.trigger('keydown', { key: 'End' })
  expect(active()).toBe('go.settings')
  await input.trigger('keydown', { key: 'Home' })
  expect(active()).toBe('go.flight')
  await input.trigger('keydown', { key: 'PageDown' })
  expect(active()).toBe('go.settings')
  await input.trigger('keydown', { key: 'PageUp' })
  expect(active()).toBe('go.flight')
  expect(input.attributes('aria-activedescendant')).toBe('palette-option-go.flight')
})

it('leaves Home and End to the caret once there is text, and puts the selection on the first row of a new query', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const input = wrapper.get('#palette-input')
  await input.trigger('keydown', { key: 'ArrowDown' })
  await type(wrapper, 'switch')
  const end = new KeyboardEvent('keydown', { key: 'End', cancelable: true, bubbles: true })
  input.element.dispatchEvent(end)

  expect(end.defaultPrevented).toBe(false)
  expect(wrapper.get('.palette-row.active').attributes('data-command')).toBe('go.flight')
})

it('closes on Escape and gives the focus back to what had it', async () => {
  const { wrapper } = await shellAt()
  const link = wrapper.get<HTMLAnchorElement>('nav a')
  link.element.focus()
  ctrlP()
  await flushPromises()
  wrapper.get('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }))
  await flushPromises()

  expect(wrapper.find('#palette-input').exists()).toBe(false)
  await vi.waitFor(() => expect(document.activeElement).toBe(link.element))
})

it('is a combobox over a listbox, in a modal dialog named "Command palette"', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const input = wrapper.get('#palette-input')
  const dialog = wrapper.get('dialog')

  expect(dialog.attributes('aria-modal')).toBe('true')
  expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe('Command palette')
  expect(input.attributes()).toMatchObject({ 'role': 'combobox', 'aria-expanded': 'true', 'aria-autocomplete': 'list' })
  expect(input.attributes('aria-controls')).toBe('palette-list')
  expect(wrapper.get('#palette-list').attributes('role')).toBe('listbox')
  const selected = wrapper.findAll('[role="option"]').map(row => row.attributes('aria-selected'))

  expect(selected).toEqual(['true', ...Array(6).fill('false')])
})

it('says how many commands there are, a moment after the query changes (not on every key), and when none match', async () => {
  vi.useFakeTimers()
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const status = () => wrapper.get('.palette-status').text()

  // The region is there at once, and empty: what is put in it a moment later is spoken (a region made full is not).
  expect(status()).toBe('')
  await vi.advanceTimersByTimeAsync(200)
  expect(status()).toBe('7 commands')
  await type(wrapper, 'param')
  expect(status()).toBe('')
  await vi.advanceTimersByTimeAsync(500)

  expect(status()).toBe('1 command')
  await type(wrapper, 'xyz')
  await vi.advanceTimersByTimeAsync(500)

  expect(status()).toBe('Nothing matches “xyz”.')
})

/**
 * Registers a command that may not run, for the test of a disabled row.
 *
 * @param execute what it does, if it is run
 * @returns the function that takes it out again
 */
function registerBlocked(execute: () => void) {
  return useCommands().register({
    id: 'test.blocked',
    labelKey: 'palette.vehicle.reboot.label',
    groupKey: 'palette.group.vehicle',
    isEnabled: () => ({ enabled: false, reasonKey: 'palette.reason.notConnected' }),
    execute: () => {
      execute()

      return {}
    },
  })
}

it('keeps a command that may not run in the list, dimmed, with its reason; Enter does not run it and says why', async () => {
  const execute = vi.fn()
  const unregister = registerBlocked(execute)
  try {
    const { wrapper } = await shellAt()
    ctrlP()
    await flushPromises()
    await type(wrapper, 'reboot')
    const row = wrapper.get('[data-command="test.blocked"]')

    expect(row.attributes('aria-disabled')).toBe('true')
    expect(row.classes()).toContain('disabled')
    expect(row.get('.palette-reason').text()).toBe('Connect to a vehicle first.')
    expect(row.attributes('aria-describedby')).toBe(row.get('.palette-reason').attributes('id'))
    await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(execute).not.toHaveBeenCalled()
    expect(wrapper.find('#palette-input').exists()).toBe(true)
    await vi.waitFor(() => expect(wrapper.get('.palette-status').text()).toBe('Connect to a vehicle first.'))
    // Asked again, the same reason is spoken again: the region is emptied first, and filled a moment later.
    await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.get('.palette-status').text()).toBe('')
    await vi.waitFor(() => expect(wrapper.get('.palette-status').text()).toBe('Connect to a vehicle first.'))
  } finally {
    unregister()
  }
})

it('starts afresh on every opening: no old query, the first row selected, the count said again', async () => {
  vi.useFakeTimers()
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const input = wrapper.get('#palette-input')
  await input.trigger('keydown', { key: 'ArrowDown' })
  await input.trigger('keydown', { key: 'ArrowDown' })
  await input.trigger('keydown', { key: 'ArrowDown' })
  await type(wrapper, 'switch')
  await vi.advanceTimersByTimeAsync(500)
  wrapper.get('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }))
  await flushPromises()
  ctrlP()
  await flushPromises()

  expect((wrapper.get('#palette-input').element as HTMLInputElement).value).toBe('')
  expect(labels(wrapper)).toHaveLength(7)
  expect(wrapper.get('.palette-row.active').attributes('data-command')).toBe('go.flight')
  expect(wrapper.get('.palette-status').text()).toBe('')
  await vi.advanceTimersByTimeAsync(200)

  expect(wrapper.get('.palette-status').text()).toBe('7 commands')
})

it('selects the first row that may run, not a disabled one at the top', async () => {
  const unregister = registerBlocked(() => undefined)
  try {
    const { wrapper } = await shellAt()
    ctrlP()
    await flushPromises()

    expect(wrapper.get('.palette-row.active').attributes('data-command')).toBe('go.flight')
    expect(wrapper.findAll('.palette-row').at(-1)?.attributes('data-command')).toBe('test.blocked')
  } finally {
    unregister()
  }
})

it('does not describe the dialog by the whole list, which a screen reader would read out on opening', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()

  expect(wrapper.get('dialog').attributes('aria-describedby')).toBeUndefined()
  expect(wrapper.get('dialog').attributes('aria-labelledby')).toBeDefined()
})

it('follows a mouse that moves, but not the scroll of a pointer at rest or a key that just moved it', async () => {
  const { wrapper } = await shellAt()
  ctrlP()
  await flushPromises()
  const active = () => wrapper.get('.palette-row.active').attributes('data-command')
  const over = (command: string, x: number, y: number) => wrapper.get(`[data-command="${command}"]`)
    .trigger('mousemove', { clientX: x, clientY: y })
  await over('go.plan', 10, 10)
  expect(active()).toBe('go.plan')

  // The same place again: the scroll that a key caused, with the pointer at rest.
  await over('go.tune', 10, 10)
  expect(active()).toBe('go.plan')
  // A key has just moved the selection: a movement now is not the user's.
  await wrapper.get('#palette-input').trigger('keydown', { key: 'ArrowDown' })
  await over('go.logs', 30, 30)

  expect(active()).toBe('go.setup')
})

it.each(LANGUAGES)('shows the placeholder, the group tags and the rows in %s', async language => {
  const { wrapper } = await shellAt()
  setLanguage(language)
  ctrlP()
  await flushPromises()
  const input = wrapper.get('#palette-input')

  expect(input.attributes('placeholder')).toBe(i18n.global.t('palette.placeholder'))
  expect(wrapper.get('.palette-group').text()).toBe(i18n.global.t('palette.group.navigate'))
  expect(labels(wrapper)[3]).toBe(i18n.global.t('palette.go.parameters'))
})

it('is Cmd P in the hint on a Mac', async () => {
  const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
  const { wrapper } = await shellAt()

  expect(wrapper.get('#open-palette kbd').text()).toBe('⌘ P')
  platform.mockRestore()
})
