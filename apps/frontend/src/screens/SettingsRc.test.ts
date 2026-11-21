// The Settings screen's Remote control section: off until the setting is turned on (and kept in the settings), the pad that is
// read and what it says (CH1 to CH16), the mapping with its rows, the throttle style, the one-click confirmation, what stands in
// the way, and that nothing here starts a control (the mock vehicle is never asked for one).
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
 * Plugs the pad in and waits for the screen to show all of it: the device, its 16 channels, the four rows of the mapping and the
 * confirmation. (The device's name comes first; what follows renders a poll later, which a slow machine makes visible.)
 *
 * @param wrapper the screen
 */
async function plugged(wrapper: VueWrapper): Promise<void> {
  axes = [0, 0, -1, 0, 0, 0, 0, 0]
  await vi.waitFor(() => {
    expect(wrapper.find('#rc-device-name').exists()).toBe(true)
    expect(wrapper.findAll('.rc-axes li')).toHaveLength(16)
    expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(4)
    expect(wrapper.find('#rc-confirm').exists()).toBe(true)
  }, { timeout: 5000 })
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
  await vi.waitFor(() => expect(wrapper.find('#rc-status').exists()).toBe(true), { timeout: 5000 })
  expect(wrapper.get('#rc-device-name').text()).toBe(TX16S)
  expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(4)
  expect(wrapper.findAll('.rc-free')).toHaveLength(12)
  expect(wrapper.get('[data-testid="rc-free-5"]').text()).toContain('Vehicle channel 5')
  expect(wrapper.get('[data-testid="rc-free-5"]').text()).toContain('The radio\'s own')
  expect(wrapper.get('#rc-device-name').text()).toBe(TX16S)
  // (the test pad has 8 axes and 4 buttons: CH1 to CH12 are there, CH13 to CH16 are shown as absent)
  expect(wrapper.findAll('.rc-axes li')).toHaveLength(16)
  expect(wrapper.findAll('.rc-axes li.rc-absent')).toHaveLength(4)
  expect(wrapper.get('.rc-axes').text()).toContain('CH1')
  expect(wrapper.get('.rc-axes').text()).toContain('CH16')
  expect(wrapper.get('#rc-channels-note').text()).toContain('Every pad is CH1 to CH16')
  expect(wrapper.get('#rc-issues').text()).toContain('not confirmed')
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
  await wrapper.get('[id$="-add-6"]').trigger('click')
  expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(5)
  expect(wrapper.find('[data-testid="rc-free-6"]').exists()).toBe(false)
  await wrapper.get('[id$="-remove-4"]').trigger('click')
  expect(wrapper.findAll('.rc-row:not(.rc-free)')).toHaveLength(4)
  expect(wrapper.find('[data-testid="rc-free-6"]').exists()).toBe(true)
})

it('confirms the mapping with one click, shows it, and takes the confirmation away with any change', async () => {
  const { wrapper, handle } = await screen()

  await plugged(wrapper)
  expect(wrapper.get('#rc-unconfirmed').text()).toContain('Not confirmed')
  await vi.waitFor(() => expect(wrapper.get('#rc-confirm').attributes('disabled')).toBeUndefined())
  await wrapper.get('#rc-confirm').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('#rc-confirmed').exists()).toBe(true), { timeout: 5000 })

  expect(wrapper.get('#rc-confirmed').text()).toContain('confirmed for this pad')
  expect(wrapper.find('#rc-unconfirmed').exists()).toBe(false)
  expect(wrapper.get('#rc-confirm').attributes('disabled')).toBeDefined()
  expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"confirmedKey":"')
  await wrapper.get('[data-testid="rc-row-0"] .kit-toggle').trigger('click')
  await flushPromises()
  expect(wrapper.find('#rc-confirmed').exists()).toBe(false)
  expect(wrapper.get('#rc-confirm').attributes('disabled')).toBeUndefined()
})

it('shows the four sticks as bars beside the confirmation, and says why it cannot be pressed with no pad read', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  expect(wrapper.findAll('.rc-sticks li')).toHaveLength(4)
  expect(wrapper.get('[data-testid="rc-stick-throttle"]').text()).toContain('Throttle')
  axes = null
  await vi.waitFor(() => expect(wrapper.find('#rc-device-gone').exists()).toBe(true))
  expect(wrapper.get('#rc-confirm').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#rc-confirm').attributes('aria-describedby')).toBeDefined()
  expect(wrapper.text()).toContain('Needs a pad that is read')
})

it('chooses how the throttle rests: centred by default, said in plain words, and a change takes the confirmation', async () => {
  const { wrapper, handle } = await screen()

  await plugged(wrapper)
  const centred = wrapper.get('input[type="radio"][value="centred"]').element as HTMLInputElement
  const low = wrapper.get('input[type="radio"][value="low"]').element as HTMLInputElement

  expect([centred.checked, low.checked]).toEqual([true, false])
  expect(wrapper.text()).toContain('The middle is no climb, up climbs, down descends')
  await vi.waitFor(() => expect(wrapper.get('#rc-confirm').attributes('disabled')).toBeUndefined())
  await wrapper.get('#rc-confirm').trigger('click')
  await wrapper.get('input[type="radio"][value="low"]').setValue(true)
  await flushPromises()

  expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"throttleStyle":"low"')
  expect(wrapper.find('#rc-confirmed').exists()).toBe(false)
  expect(wrapper.text()).toContain('The stick rests at the bottom')
})

it('says which stick is not at rest, with what it reads: what the turn-on would wait for', async () => {
  const { wrapper } = await screen()

  await plugged(wrapper)
  axes = [0.72, 0, -1, 0, 0, 0, 0, 0]
  await vi.waitFor(() => expect(wrapper.get('#rc-rest').text()).toContain('+0.72'))

  expect(wrapper.get('#rc-rest').text()).toContain('Roll is not at the middle')
  expect(wrapper.get('#rc-rest').text()).toContain('Throttle is not in the middle')
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
  await vi.waitFor(() => expect(wrapper.get('#rc-confirm').attributes('disabled')).toBeUndefined())
  await wrapper.get('#rc-confirm').trigger('click')
  await flushPromises()

  expect(control.rc?.began()).toBe(0)
  expect(control.rc?.on()).toBe(false)
})
