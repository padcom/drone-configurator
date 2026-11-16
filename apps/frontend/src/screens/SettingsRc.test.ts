// The Settings screen's Remote control section: off until the setting is turned on (and kept in the settings), the pad that is
// read and what it says, the mapping with its rows, the calibration wizard, what stands in the way, and that nothing here starts
// a control (the mock vehicle is never asked for one).
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetRcAllowChoice } from '@/composables/useRcSettings'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { profileKey } from '@/lib/rc/store'
import { TX16S } from '@/testing/fakeGamepads'
import Settings from './Settings.vue'

let mounted: VueWrapper | undefined
/** What `navigator.getGamepads()` says: the axes of one pad, or no pad. */
let axes: number[] | null = null

beforeEach(() => {
  axes = null
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => (axes === null
      ? [null]
      : [{ id: TX16S, index: 0, connected: true, axes, buttons: Array.from({ length: 4 }, () => ({ value: 0 })) }]),
  })
})

afterEach(() => {
  setLanguage('en')
  forgetRcAllowChoice()
  mounted?.unmount()
  mounted = undefined
  Reflect.deleteProperty(navigator, 'getGamepads')
})

/**
 * The Settings screen over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the screen, the Configurator and what the mock vehicle counted
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, control }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

/**
 * Plugs the pad in and waits for the screen to show its mapping.
 *
 * @param wrapper the screen
 */
async function plugged(wrapper: VueWrapper): Promise<void> {
  axes = [0, 0, -1, 0, 0, 0, 0, 0]
  await vi.waitFor(() => expect(wrapper.find('#rc-device-name').exists()).toBe(true))
}

it('is off until the setting is turned on, and keeps it in the settings', async () => {
  const { wrapper, handle } = await screen()

  expect(wrapper.get('#rc-allow').attributes('aria-checked')).toBe('false')
  await wrapper.get('#rc-allow').trigger('click')
  await flushPromises()

  expect(wrapper.get('#rc-allow').attributes('aria-checked')).toBe('true')
  expect(handle.settings.uiValue('rc.allow')).toBe('on')
})

it('says there is no pad, and shows no mapping, until the radio is moved', async () => {
  const { wrapper } = await screen()

  expect(wrapper.get('#rc-no-device').text()).toContain('No gamepad found')
  expect(wrapper.find('.rc-mapping').exists()).toBe(false)
})

it('shows the pad, its mapping of four sticks, and what stands in the way', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  // (allowing it says nothing of the link: the toggle says it is off, so there is no line to say it again)
  expect(wrapper.find('#rc-status').exists()).toBe(false)
  await wrapper.get('#rc-allow').trigger('click')
  await flushPromises()
  expect(wrapper.get('#rc-device-name').text()).toBe(TX16S)
  expect(wrapper.findAll('.rc-row')).toHaveLength(4)
  expect(wrapper.get('#rc-issues').text()).toContain('has not been calibrated')
  expect(wrapper.get('#rc-status').text()).toContain('needs a simulator')
})

it('changes a row and keeps the mapping in the settings, and adds and takes away a row', async () => {
  const { wrapper, handle } = await screen()

  await plugged(wrapper)
  await wrapper.get('[data-testid="rc-row-0"] .kit-toggle').trigger('click')
  await flushPromises()
  expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"invert":true')
  await wrapper.get('[id$="-add-switch"]').trigger('click')
  expect(wrapper.findAll('.rc-row')).toHaveLength(5)
  await wrapper.get('[id$="-remove-4"]').trigger('click')
  expect(wrapper.findAll('.rc-row')).toHaveLength(4)
})

it('runs the wizard, which locks the rows, and can be given up', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  await wrapper.get('#rc-calibrate').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('[id$="-add-stick"]').attributes('disabled')).toBeDefined())
  expect(wrapper.find('#rc-next').exists()).toBe(true)
  await wrapper.get('#rc-wizard-cancel').trigger('click')
  expect(wrapper.find('#rc-next').exists()).toBe(false)
  expect(wrapper.get('[id$="-add-stick"]').attributes('disabled')).toBeUndefined()
})

it('never starts a control: the mock vehicle is not asked for one, whatever is set', async () => {
  const { wrapper, control } = await screen([{ key: 'rc.allow', value: 'on' }])

  await plugged(wrapper)
  await wrapper.get('#rc-calibrate').trigger('click')
  await wrapper.get('#rc-wizard-cancel').trigger('click')
  await flushPromises()

  expect(control.rc?.began()).toBe(0)
  expect(control.rc?.on()).toBe(false)
})
