// The Radio page against the mock backend (which has the backend's rules): the bars that follow the channels live (a pulse
// that is not a reading never moves one), a calibration that is started and ended by the user, what it captured chosen (and
// not written) for the page's one write, nothing chosen from one that was cancelled, and the end of a calibration whenever its
// page is left.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupRadio from './SetupRadio.vue'

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

/**
 * A parameter of the vehicle.
 *
 * @param id its name
 * @param value its value
 * @param index its place in the list
 * @returns the parameter
 */
function intParam(id: string, value: number, index: number): typeof SETUP_PARAMS[number] {
  return { id, kind: 'int', type: 'INT16', value, index }
}

/** What the vehicle has besides a Copter that was set up: the trims, and the functions of the switches of channels 5 to 8. */
const WITH_RADIO = [
  ...SETUP_PARAMS,
  ...[1, 2, 3, 4].map((n, i) => intParam(`RC${n}_TRIM`, 1496, 800 + i)),
  ...[5, 6, 7, 8].map((n, i) => intParam(`RC${n}_OPTION`, n === 7 ? 4 : 0, 820 + i)),
]

/**
 * The page over a connected simulated vehicle that is disarmed, with a radio calibration that takes a step every few ms.
 *
 * @param more more of the mock's options
 * @returns the page and what drives it
 */
async function page(more: MockOptions = {}): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(
    mockBackend({ telemetryMs: 600_000, params: WITH_RADIO, control, calibration: { intervalMs: 5 }, ...more }),
    () => Promise.resolve(true),
  )
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(SetupRadio, { global: { plugins: [i18n, router] } })
  await flushPromises()

  return { wrapper: mounted, handle, control }
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
 * Waits until the Done button can be pressed: the calibration is running and has taken readings in.
 *
 * @param wrapper the page
 */
async function readyToFinish(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => expect(wrapper.get('#setup-radio-finish').attributes('disabled')).toBeUndefined())
}

/**
 * The parameters the page says it will write.
 *
 * @param wrapper the page
 * @returns their names
 */
function writes(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.setup-writes li').map(item => item.text())
}

it('shows a bar for every channel, named by what it is, with its pulse and its range', async () => {
  const { wrapper } = await page()

  expect(wrapper.findAll('.setup-channel-row')).toHaveLength(8)
  expect(wrapper.get('[data-channel="1"] .setup-channel-name').text()).toBe('Channel 1 · Roll')
  expect(wrapper.get('[data-channel="3"] .setup-channel-name').text()).toBe('Channel 3 · Throttle')
  expect(wrapper.get('[data-channel="5"] .setup-channel-name').text()).toBe('Channel 5')
  expect(wrapper.get('[data-channel="1"] .setup-channel-pulse').text()).toBe('1500 µs')
  // the vehicle's own range of channel 1 (RC1_MIN, RC1_MAX), until a calibration has one
  expect(wrapper.get('[data-channel="1"] .setup-channel-range').text()).toBe('1008–1992')
  expect(wrapper.get('[data-channel="1"] [role="progressbar"]').attributes('aria-valuenow')).toBe('50')
})

it('shows no bar for a pulse that is not a reading, and says nothing is there before the receiver sends channels', async () => {
  const { wrapper, handle } = await page()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, rc: { channels: [1500, 0, 1000], ageMs: 100 } } })
  await flushPromises()

  expect(wrapper.get('[data-channel="2"] .setup-channel-pulse').text()).toBe('—')
  expect(wrapper.get('[data-channel="2"] [role="progressbar"]').attributes('aria-valuenow')).toBe('0')
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, rc: undefined } })
  await flushPromises()
  expect(wrapper.findAll('.setup-channel-row')).toHaveLength(0)
  expect(wrapper.text()).toContain('No radio channels yet')
})

it('lists the switch of each auxiliary channel the vehicle has a function for, with the names the metadata gives', async () => {
  const { wrapper, handle } = await page()
  expect(wrapper.findAll('.setup-aux-row').map(row => row.attributes('data-aux'))).toEqual(['5', '6', '7', '8'])
  // the function of channel 7 is 4 and no metadata names it: the number is shown, never a made-up name
  expect(wrapper.get('[data-aux="7"] input').element).toHaveProperty('value', '4')

  handle.metadata.load(JSON.stringify({
    format: 'drone-configurator/param-metadata',
    version: 1,
    params: { RC7_OPTION: { values: { 0: 'Do Nothing', 4: 'RTL' } } },
  }))
  await flushPromises()
  expect(wrapper.get('[data-aux="7"] input').element).toHaveProperty('value', 'RTL')
})

it('captures while the user moves the sticks, ends only when the user says so, and chooses what it found', async () => {
  const { wrapper, handle } = await page()
  expect(wrapper.get('#setup-radio-finish').attributes('disabled')).toBeDefined()
  await press(wrapper, 'setup-radio-start')
  await readyToFinish(wrapper)
  expect(wrapper.get('#setup-radio-status').text()).toContain('Calibrating')
  // a calibration that has not been ended is not a result: nothing is chosen yet
  expect(writes(wrapper)).toEqual([])
  await press(wrapper, 'setup-radio-finish')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.find('#setup-radio-staged').exists()).toBe(true))

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('success')
  // the range of roll, pitch and yaw and the throttle, and the trim of roll, pitch and yaw but not the throttle
  expect(writes(wrapper)).toEqual(expect.arrayContaining(['RC1_MIN', 'RC1_MAX', 'RC1_TRIM', 'RC3_MIN', 'RC3_MAX']))
  expect(writes(wrapper)).not.toContain('RC3_TRIM')
  // nothing was written to the vehicle: the vehicle's values are what they were
  expect(handle.parameters.params.value.find(param => param.id === 'RC1_MIN')?.value).toBe(1008)
  expect(wrapper.get('#setup-radio-write').attributes('disabled')).toBeUndefined()
})

it('chooses nothing from a calibration that is cancelled, and says it was cancelled', async () => {
  const { wrapper } = await page()
  await press(wrapper, 'setup-radio-start')
  await readyToFinish(wrapper)
  await press(wrapper, 'setup-radio-cancel')

  expect(wrapper.get('#calibration-result').attributes('data-outcome')).toBe('cancelled')
  expect(writes(wrapper)).toEqual([])
  expect(wrapper.find('#setup-radio-staged').exists()).toBe(false)
  expect(wrapper.get('#setup-radio-start').attributes('disabled')).toBeUndefined()
})

it('cancels the calibration when the page is left, so that the vehicle is never left calibrating', async () => {
  const { wrapper, handle } = await page()
  await press(wrapper, 'setup-radio-start')
  await readyToFinish(wrapper)
  wrapper.unmount()
  mounted = undefined
  await vi.waitFor(() => expect(handle.calibration.state.value.state).toBe('finished'))

  expect(handle.calibration.result.value?.outcome).toBe('cancelled')
  expect(handle.calibration.state.value.radio).toBeUndefined()
})

it('ends the calibration, and chooses nothing, when the link is lost', async () => {
  const { wrapper, handle } = await page()
  await press(wrapper, 'setup-radio-start')
  await readyToFinish(wrapper)
  await handle.vehicle.disconnect()
  await vi.waitFor(() => expect(handle.calibration.result.value?.code).toBe('LINK_LOST'))
  expect(writes(wrapper)).toEqual([])
})

it('does not start while the vehicle is armed, and says why', async () => {
  const { wrapper, handle } = await page()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('#calibration-blocked').text()).toContain('armed')
  expect(wrapper.get('#setup-radio-start').attributes('disabled')).toBeDefined()
})

it('does not let a switch function be chosen while a calibration runs', async () => {
  const { wrapper } = await page()
  await press(wrapper, 'setup-radio-start')
  await readyToFinish(wrapper)

  expect(wrapper.get('[data-aux="5"] input').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#setup-radio-write').attributes('disabled')).toBeDefined()
})
