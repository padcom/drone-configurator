// The Accelerometer and Compass pages against the mock backend (which has the backend's rules): the six positions the vehicle
// asks for, a result that is a success only when the vehicle says so, a failure shown as a failure, the compass results that
// wait for an explicit accept (nothing is kept before), the refusals (armed, not known to be disarmed, a second calibration),
// the vehicle's own texts, and the end of a calibration whenever its page is left.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import type { Component } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupAccel from './SetupAccel.vue'
import SetupCompass from './SetupCompass.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** What a test has: the page, the Configurator, and the mock's controls. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
}

/** The parameters of a vehicle with three compasses in an order (device ids), besides those of a Copter that was set up. */
const WITH_ORDER = [
  ...SETUP_PARAMS,
  { id: 'COMPASS_PRIO1_ID', kind: 'int' as const, type: 'INT32', value: 466441, index: 900 },
  { id: 'COMPASS_PRIO2_ID', kind: 'int' as const, type: 'INT32', value: 466697, index: 901 },
  { id: 'COMPASS_PRIO3_ID', kind: 'int' as const, type: 'INT32', value: 0, index: 902 },
]

/**
 * A page over a connected simulated vehicle that is disarmed, with a calibration that takes a few milliseconds a step.
 *
 * @param component the page
 * @param more more of the mock's options
 * @returns the page and what drives it
 */
async function page(component: Component, more: MockOptions = {}): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(
    mockBackend({ telemetryMs: 600_000, params: WITH_ORDER, control, calibration: { intervalMs: 5 }, ...more }),
    () => Promise.resolve(true),
  )
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(component, { global: { plugins: [i18n, router] } })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

/**
 * The vehicle's first compass offset (X), as the interface has it.
 *
 * @param handle the Configurator
 * @returns its value
 */
function offsetX(handle: Rig['handle']): number | undefined {
  return handle.parameters.params.value.find(param => param.id === 'COMPASS_OFS_X')?.value
}

/**
 * Waits until a selector is in the page.
 *
 * @param wrapper the page
 * @param selector what to wait for
 */
async function seen(wrapper: VueWrapper, selector: string): Promise<void> {
  await vi.waitFor(() => expect(wrapper.find(selector).exists()).toBe(true))
}

/**
 * Presses a button of the page.
 *
 * @param wrapper the page
 * @param id the button's id
 */
async function press(wrapper: VueWrapper, id: string): Promise<void> {
  await wrapper.get(`#${id}`).trigger('click')
  await flushPromises()
}

/**
 * Says the vehicle is in each position from `position` to `last`, when the vehicle asks for it: until the vehicle has said it
 * worked, no values are shown.
 *
 * @param wrapper the page
 * @param position the position to begin with
 * @param last the position to end with
 */
async function placeFrom(wrapper: VueWrapper, position: number, last: number): Promise<void> {
  if (position > last) {
    return
  }
  await seen(wrapper, `[data-position="${position}"].current`)
  expect(wrapper.find('#setup-accel-values').exists()).toBe(false)
  expect(wrapper.get('#setup-accel-status').text()).toContain('keep it still')
  await vi.waitFor(() => expect(wrapper.get('#setup-accel-placed').attributes('disabled')).toBeUndefined())
  await press(wrapper, 'setup-accel-placed')
  await placeFrom(wrapper, position + 1, last)
}

it('is idle with only Start and Level enabled, and says nothing is running', async () => {
  const { wrapper } = await page(SetupAccel)

  expect(wrapper.get('#setup-accel-status').text()).toBe('No calibration is running.')
  expect(wrapper.get('#setup-accel-start').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('#setup-accel-level').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('#setup-accel-placed').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#setup-accel-cancel').attributes('disabled')).toBeDefined()
  expect(wrapper.findAll('.setup-position')).toHaveLength(6)
  expect(wrapper.find('#calibration-blocked').exists()).toBe(false)
})

it('walks through the six positions the vehicle asks for, and shows the values only once it says it worked', async () => {
  const { wrapper } = await page(SetupAccel)
  await press(wrapper, 'setup-accel-start')
  await placeFrom(wrapper, 1, 6)
  await seen(wrapper, '#calibration-result')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('success')
  expect(wrapper.get('#calibration-result').text()).toContain('Calibration done')
  expect(wrapper.findAll('.setup-position.placed')).toHaveLength(6)
  expect(wrapper.get('#setup-accel-values').text()).toContain('INS_ACCOFFS_X0.12')
  expect(wrapper.get('#calibration-texts').text()).toContain('Calibration successful')
})

it('shows a failure as a failure, with the vehicle\'s words, and no values', async () => {
  const { wrapper } = await page(SetupAccel, { calibration: { intervalMs: 5, failAt: 2 } })
  await press(wrapper, 'setup-accel-start')
  await placeFrom(wrapper, 1, 2)
  await seen(wrapper, '#calibration-result')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('failed')
  expect(wrapper.get('#calibration-result').text()).toContain('Calibration failed')
  expect(wrapper.get('#calibration-texts').text()).toContain('Calibration FAILED')
  expect(wrapper.find('#setup-accel-values').exists()).toBe(false)
  expect(wrapper.find('#calibration-result').classes()).not.toContain('info')
})

it('sets the level with one press', async () => {
  const { wrapper } = await page(SetupAccel)
  await press(wrapper, 'setup-accel-level')
  await seen(wrapper, '#calibration-result')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('success')
  expect(wrapper.get('#calibration-texts').text()).toContain('Trim OK')
  expect(wrapper.find('#setup-accel-values').exists()).toBe(false)
})

it('cancels, and says it was cancelled', async () => {
  const { wrapper } = await page(SetupAccel)
  await press(wrapper, 'setup-accel-start')
  await seen(wrapper, '[data-position="1"].current')
  await press(wrapper, 'setup-accel-cancel')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('cancelled')
  expect(wrapper.get('#setup-accel-start').attributes('disabled')).toBeUndefined()
})

it('refuses to start while the vehicle is armed, and says why', async () => {
  const { wrapper, handle } = await page(SetupAccel)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('#calibration-blocked').text()).toContain('armed')
  expect(wrapper.get('#setup-accel-start').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#setup-accel-level').attributes('disabled')).toBeDefined()
})

it('refuses to start while the armed state is not known, and says why', async () => {
  const { wrapper, handle } = await page(SetupAccel)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 6000 } })
  await flushPromises()

  expect(wrapper.get('#calibration-blocked').text()).toContain('not known')
  expect(wrapper.get('#setup-accel-start').attributes('disabled')).toBeDefined()
})

it('says what the backend refused: a second calibration, and an armed vehicle the page did not know of', async () => {
  const { wrapper, handle, control } = await page(SetupAccel)
  await press(wrapper, 'setup-accel-start')
  await seen(wrapper, '[data-position="1"].current')
  await handle.calibration.start('level')
  await flushPromises()

  expect(wrapper.get('#calibration-error').text()).toContain('Something else is running')
  await press(wrapper, 'setup-accel-cancel')
  control.armed?.(true)
  await handle.calibration.start('level')
  await flushPromises()

  expect(wrapper.get('#calibration-error').text()).toContain('armed')
})

it('cancels the calibration when the page is left', async () => {
  const { wrapper, handle } = await page(SetupAccel)
  await press(wrapper, 'setup-accel-start')
  await seen(wrapper, '[data-position="1"].current')
  wrapper.unmount()
  mounted = undefined
  await vi.waitFor(() => expect(handle.calibration.state.value.state).toBe('finished'))

  expect(handle.calibration.result.value?.outcome).toBe('cancelled')
})

it('shows no calibration as running when the link is lost', async () => {
  const { wrapper, handle, control } = await page(SetupAccel)
  await press(wrapper, 'setup-accel-start')
  await seen(wrapper, '[data-position="1"].current')
  control.connection?.({ state: 'lost', error: 'the link closed' })
  await flushPromises()

  expect(handle.calibration.running.value).toBe(false)
  expect(wrapper.get('#calibration-result').text()).toContain('the link to the vehicle was lost')
})

it('runs the compass to its reports and keeps nothing until the user accepts', async () => {
  const { wrapper, handle } = await page(SetupCompass)
  const old = offsetX(handle)
  await press(wrapper, 'setup-compass-start')
  await seen(wrapper, '[data-compass="0"]')
  await seen(wrapper, '#setup-compass-accept')

  expect(wrapper.findAll('.setup-compass')).toHaveLength(2)
  expect(wrapper.get('[data-compass="0"] .setup-sphere').attributes('aria-label')).toContain('80 of 80')
  expect(wrapper.findAll('[data-compass="0"] .setup-section.lit')).toHaveLength(80)
  expect(wrapper.get('[data-report="0"]').text()).toContain('12.5')
  expect(wrapper.get('[data-report="0"]').text()).toContain('Old offsets')
  // the vehicle was not told to keep anything: the offsets are still the old ones
  expect(offsetX(handle)).toBe(old)
  expect(wrapper.find('#setup-compass-kept').exists()).toBe(false)
  expect(wrapper.find('#setup-reboot').exists()).toBe(false)
  expect(wrapper.get('#setup-compass-accept').attributes('disabled')).toBeUndefined()
})

it('keeps the results when they are accepted, replaces the old offsets, and offers the reboot', async () => {
  const { wrapper, handle } = await page(SetupCompass)
  await press(wrapper, 'setup-compass-start')
  await seen(wrapper, '#setup-compass-accept')
  await press(wrapper, 'setup-compass-accept')
  await seen(wrapper, '#setup-compass-kept')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('success')
  expect(wrapper.get('#setup-reboot').text()).toContain('Reboot')
  expect(offsetX(handle)).toBe(12.5)
})

it('drops the results when they are discarded', async () => {
  const { wrapper, handle } = await page(SetupCompass)
  const old = offsetX(handle)
  await press(wrapper, 'setup-compass-start')
  await seen(wrapper, '#setup-compass-discard')
  await press(wrapper, 'setup-compass-discard')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('cancelled')
  expect(offsetX(handle)).toBe(old)
  expect(wrapper.find('.setup-compass').exists()).toBe(false)
  expect(wrapper.find('#setup-compass-kept').exists()).toBe(false)
  expect(wrapper.find('#setup-reboot').exists()).toBe(false)
})

it('cannot accept a compass that failed, and says why it failed', async () => {
  const { wrapper } = await page(SetupCompass, { calibration: { intervalMs: 5, compassStatus: 'FAILED_RADIUS' } })
  await press(wrapper, 'setup-compass-start')
  await seen(wrapper, '#setup-compass-discard')

  expect(wrapper.get('[data-compass="0"]').text()).toContain('Failed: radius')
  expect(wrapper.get('#setup-compass-accept').attributes('disabled')).toBeDefined()
})

it('starts with the vehicle\'s autosave off, and sends it only when the user turns it on', async () => {
  const { wrapper, handle } = await page(SetupCompass)
  const start = vi.spyOn(handle.calibration, 'start')
  expect(wrapper.get('#setup-compass-autosave').attributes('aria-checked')).toBe('false')
  await press(wrapper, 'setup-compass-start')
  expect(start).toHaveBeenLastCalledWith('compass', { autosave: false })
  await press(wrapper, 'setup-compass-cancel')
  await wrapper.get('#setup-compass-autosave').trigger('click')
  await press(wrapper, 'setup-compass-start')

  expect(start).toHaveBeenLastCalledWith('compass', { autosave: true })
})

it('cancels the compass calibration when the page is left, results waiting or not', async () => {
  const { wrapper, handle } = await page(SetupCompass)
  const old = offsetX(handle)
  await press(wrapper, 'setup-compass-start')
  await seen(wrapper, '#setup-compass-accept')
  wrapper.unmount()
  mounted = undefined
  await vi.waitFor(() => expect(handle.calibration.state.value.state).toBe('finished'))

  expect(handle.calibration.result.value?.outcome).toBe('cancelled')
  expect(offsetX(handle)).toBe(old)
})

it('lists the compasses in their order, and moves one by swapping it with its neighbour, writing nothing', async () => {
  const { wrapper } = await page(SetupCompass)

  expect(wrapper.get('[data-place="1"]').text()).toContain('i2c')
  expect(wrapper.get('[data-place="3"]').text()).toContain('no compass')
  expect(wrapper.get('[data-place="1"] button[aria-label="Move place 1 up"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-place="2"] button[aria-label="Move place 2 down"]').attributes('disabled')).toBeDefined()
  const before = wrapper.get('[data-place="1"]').text()
  await wrapper.get('[data-place="2"] button[aria-label="Move place 2 up"]').trigger('click')
  await flushPromises()

  expect(wrapper.get('[data-place="1"]').text()).not.toBe(before)
  expect(wrapper.get('.setup-writes').text()).toContain('COMPASS_PRIO1_ID')
  expect(wrapper.get('#setup-compass-write').attributes('disabled')).toBeUndefined()
})

it('does not move a compass while a calibration runs', async () => {
  const { wrapper } = await page(SetupCompass)
  await press(wrapper, 'setup-compass-start')
  await seen(wrapper, '[data-compass="0"]')

  expect(wrapper.get('[data-place="2"] button[aria-label="Move place 2 up"]').attributes('disabled')).toBeDefined()
})

it('has its words in another language', async () => {
  setLanguage('de')
  const { wrapper } = await page(SetupAccel)

  expect(wrapper.get('#setup-accel-status').text()).toBe('Es läuft keine Kalibrierung.')
  expect(wrapper.get('#setup-accel-start').text()).toBe('Kalibrieren (sechs Lagen)')
})
