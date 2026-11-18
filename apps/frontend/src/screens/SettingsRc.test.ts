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
  mounted = mount(Settings, { global: { plugins: [i18n] }, attachTo: document.body })
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

it('has one switch for the sticks that arm and disarm: off, shut until remote control is allowed, said in one line', async () => {
  const { wrapper, handle } = await screen()
  const rudder = wrapper.get('#rc-rudder-arm')

  expect(rudder.attributes('aria-checked')).toBe('false')
  expect(rudder.attributes('disabled')).toBeDefined()
  expect(wrapper.text().match(/disarm it ON THE GROUND only/g)).toHaveLength(1)
  // (while it is shut, one line says why, and the switch is described by it too)
  expect(wrapper.text().match(/Allow remote control first/g)).toHaveLength(1)
  const reason = wrapper.findAll('p').find(line => line.text().includes('Allow remote control first'))

  expect(rudder.attributes('aria-describedby')).toContain(reason?.attributes('id') ?? 'none')
  await wrapper.get('#rc-allow').trigger('click')
  await flushPromises()
  expect(wrapper.text()).not.toContain('Allow remote control first')
  expect(wrapper.get('#rc-rudder-arm').attributes('aria-describedby')).not.toContain('-rudder-shut')
  expect(wrapper.get('#rc-rudder-arm').attributes('disabled')).toBeUndefined()
  await wrapper.get('#rc-rudder-arm').trigger('click')
  await flushPromises()
  expect(wrapper.get('#rc-rudder-arm').attributes('aria-checked')).toBe('true')
  expect(handle.settings.uiValue('rc.rudderArm')).toBe('on')
  await wrapper.get('#rc-rudder-arm').trigger('click')
  await flushPromises()
  expect(handle.settings.uiValue('rc.rudderArm')).toBe('off')
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
  expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(4)
  expect(wrapper.findAll('.rc-free')).toHaveLength(12)
  expect(wrapper.get('[data-testid="rc-free-5"]').text()).toContain('Vehicle channel 5')
  expect(wrapper.get('[data-testid="rc-free-5"]').text()).toContain('The radio\'s own')
  expect(wrapper.get('#rc-device-name').text()).toBe(TX16S)
  expect(wrapper.get('.rc-axes').text()).toContain('CH1')
  expect(wrapper.get('.rc-axes').text()).toContain('CH8')
  expect(wrapper.get('.rc-axes').text()).not.toContain('CH9')
  expect(wrapper.get('#rc-axes-note').text()).toContain('may not report every axis')
  expect(wrapper.get('#rc-issues').text()).toContain('has not been calibrated')
  expect(wrapper.get('#rc-status').text()).toBe('No simulator is connected.')
  expect(wrapper.find('output').exists()).toBe(false)
})

it('says each fact once: the simulator rule in one place, and a pad that is not read in the gamepad part only', async () => {
  const { wrapper } = await screen([{ key: 'rc.allow', value: 'on' }])

  await plugged(wrapper)
  axes = null
  await vi.waitFor(() => expect(wrapper.find('#rc-device-gone').exists()).toBe(true))
  const text = wrapper.text()

  expect(text.match(/built-in simulator or a link to this computer/gu)).toHaveLength(1)
  expect(text.match(/not being read/gu)).toHaveLength(1)
  expect(text.match(/No gamepad/gu) ?? []).toHaveLength(0)
})

it('changes a row and keeps the mapping in the settings, and adds and takes away a row', async () => {
  const { wrapper, handle } = await screen()

  await plugged(wrapper)
  await wrapper.get('[data-testid="rc-row-0"] .kit-toggle').trigger('click')
  await flushPromises()
  expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"invert":true')
  await wrapper.get('[id$="-add-switch-6"]').trigger('click')
  expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(5)
  expect(wrapper.find('[data-testid="rc-free-6"]').exists()).toBe(false)
  await wrapper.get('[id$="-remove-4"]').trigger('click')
  expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(4)
  expect(wrapper.find('[data-testid="rc-free-6"]').exists()).toBe(true)
})

it('runs the wizard, which locks the rows, and can be given up', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  await wrapper.get('#rc-wizard-main').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('[id$="-add-stick-5"]').attributes('disabled')).toBeDefined())
  expect(wrapper.get('#rc-wizard-main').text()).toBe('Next')
  await wrapper.get('#rc-wizard-cancel').trigger('click')
  expect(wrapper.find('#rc-wizard-cancel').exists()).toBe(false)
  expect(wrapper.get('#rc-wizard-main').text()).toBe('Calibrate…')
  expect(wrapper.get('[id$="-add-stick-5"]').attributes('disabled')).toBeUndefined()
})

it('keeps focus in the wizard: one button through the steps, and focus comes back to it when it is given up', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  const button = wrapper.get('#rc-wizard-main').element as HTMLButtonElement

  button.focus()
  await wrapper.get('#rc-wizard-main').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('#rc-wizard-main').text()).toBe('Next'))
  expect(wrapper.get('#rc-wizard-main').element).toBe(button)
  expect(document.activeElement).toBe(button)
  await wrapper.get('#rc-wizard-cancel').trigger('click')
  await flushPromises()

  expect(wrapper.get('#rc-wizard-main').element).toBe(button)
  expect(document.activeElement).toBe(button)
})

it('says why the wizard\'s button is disabled: the pad that is not read, and the first step that is not done', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  axes = null
  await vi.waitFor(() => expect(wrapper.find('#rc-device-gone').exists()).toBe(true))
  expect(wrapper.get('#rc-wizard-main').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#rc-wizard-main').attributes('aria-describedby')).toBe('rc-device-gone')
  axes = [0, 0, -1, 0, 0, 0, 0, 0]
  await vi.waitFor(() => expect(wrapper.get('#rc-wizard-main').attributes('disabled')).toBeUndefined())
  await wrapper.get('#rc-wizard-main').trigger('click')
  const described = wrapper.get('#rc-wizard-main').attributes('aria-describedby')

  expect(wrapper.get('#rc-wizard-main').attributes('disabled')).toBeDefined()
  expect(wrapper.get(`[id="${described}"]`).text()).toContain('Leave the sticks')
})

it('moves a row to the channel that is chosen, shows it there, and keeps the focus in its field', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  const select = wrapper.get('[data-testid="rc-row-0"] select');
  (select.element as HTMLSelectElement).focus()
  await select.setValue('9')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.find('[data-testid="rc-free-1"]').exists()).toBe(true))
  const field = wrapper.get('[data-testid="rc-row-0"] select').element as HTMLSelectElement

  expect(field.value).toBe('9')
  expect(document.activeElement).toBe(field)
  expect(wrapper.find('[data-testid="rc-free-9"]').exists()).toBe(false)
})

it('never starts a control: the mock vehicle is not asked for one, whatever is set', async () => {
  const { wrapper, control } = await screen([{ key: 'rc.allow', value: 'on' }])

  await plugged(wrapper)
  await wrapper.get('#rc-wizard-main').trigger('click')
  await wrapper.get('#rc-wizard-cancel').trigger('click')
  await flushPromises()

  expect(control.rc?.began()).toBe(0)
  expect(control.rc?.on()).toBe(false)
})
