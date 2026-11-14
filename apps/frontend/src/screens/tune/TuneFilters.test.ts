// The Filters part of the Tune screen against the mock backend: a row for each of the nine parameters the vehicle has (and the
// ones it has not named); the ones read only when the vehicle starts are written while it is disarmed, and are off while it is
// armed, with the reason; the ones that take effect in flight are written armed after the hold; and the notch is warned about
// when it takes out none of the peaks of the log that is open in Spectrum.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import type { Param } from '@/generated/app'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import Tune from '../Tune.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** The vehicle's filters: the gyro cutoff and the notch (enabled, tracking the throttle, at 80 Hz, the first two harmonics). */
const FILTERS: [string, number][] = [
  ['INS_GYRO_FILTER', 20],
  ['INS_HNTCH_ENABLE', 1],
  ['INS_HNTCH_MODE', 1],
  ['INS_HNTCH_REF', 0.2],
  ['INS_HNTCH_FREQ', 80],
  ['INS_HNTCH_BW', 40],
  ['INS_HNTCH_ATT', 40],
  ['INS_HNTCH_HMNCS', 3],
  ['INS_HNTCH_OPTS', 0],
]
const WITH_FILTERS: Param[] = [
  ...SETUP_PARAMS,
  ...FILTERS.map(([id, value], index): Param => ({ id, kind: 'real', type: 'REAL32', value, index: 900 + index })),
]
/** The log of the mock that has raw IMU batches: its spectrum peaks at 150 Hz, with a harmonic at 300 Hz. */
const LOG = 'uid-mock/00000003-1a2b3c4d.BIN'

/** What a test has: the screen, the Configurator, the mock's controls and the questions asked. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
  asked: string[]
}

/**
 * The Filters part over a connected simulated vehicle, disarmed.
 *
 * @param params the vehicle's parameters
 * @returns the screen and what drives it
 */
async function screen(params: Param[] = WITH_FILTERS): Promise<Rig> {
  const asked: string[] = []
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 1, params, control }), question => {
    asked.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/tune/filters')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(Tune) }), { global: { plugins: [i18n, router] } })
  await flushPromises()
  await flushPromises()

  return { wrapper: mounted, handle, control, asked }
}

/**
 * Arms the vehicle, as the telemetry says.
 *
 * @param rig the rig
 */
async function arm(rig: Rig): Promise<void> {
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()
}

/**
 * The value of a parameter on the vehicle, as the interface has it.
 *
 * @param rig the rig
 * @param id the parameter
 * @returns its value
 */
function valueOf(rig: Rig, id: string): number | undefined {
  return rig.handle.parameters.params.value.find(param => param.id === id)?.value
}

/**
 * Types a value in the field of a slider row.
 *
 * @param rig the rig
 * @param id the parameter
 * @param text what is typed
 */
async function type(rig: Rig, id: string, text: string): Promise<void> {
  await rig.wrapper.get(`[data-tune="${id}"] input[type="text"]`).setValue(text)
}

/**
 * Presses Write and lets the writes go.
 *
 * @param rig the rig
 */
async function write(rig: Rig): Promise<void> {
  await rig.wrapper.get('#tune-filters-write').trigger('click')
  await flushPromises()
  await flushPromises()
}

it('has a row for each of the nine parameters, with its name and "was X", and says which the vehicle has not', async () => {
  const { wrapper } = await screen()

  for (const [id] of FILTERS) {
    expect(wrapper.find(`[data-tune="${id}"]`).exists()).toBe(true)
  }
  expect(wrapper.get('[data-tune="INS_HNTCH_FREQ"] .tune-names').text()).toBe('INS_HNTCH_FREQ')
  expect(wrapper.get('[data-tune="INS_HNTCH_FREQ"] .tune-was').text()).toBe('was 80')
  const range = wrapper.get('[data-tune="INS_HNTCH_FREQ"] input[type="range"]')
  expect([range.attributes('min'), range.attributes('max')]).toEqual(['10', '495'])
  expect(wrapper.find('#tune-filters-missing').exists()).toBe(false)

  const without = await screen(SETUP_PARAMS)
  expect(without.wrapper.get('#tune-filters-missing').text()).toContain('INS_HNTCH_FREQ')
  expect(without.wrapper.find('[data-tune="INS_HNTCH_FREQ"]').exists()).toBe(false)
})

it('writes a change of the notch and of its harmonics in ONE question that names both, each read back', async () => {
  const rig = await screen()
  await type(rig, 'INS_HNTCH_FREQ', '95')
  await rig.wrapper.findAll('[data-tune="INS_HNTCH_HMNCS"] input[type="checkbox"]')[2]?.setValue(true)
  await write(rig)

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('INS_HNTCH_FREQ 80 → 95')
  expect(rig.asked[0]).toContain('INS_HNTCH_HMNCS 3 → 7')
  expect(valueOf(rig, 'INS_HNTCH_FREQ')).toBe(95)
  expect(valueOf(rig, 'INS_HNTCH_HMNCS')).toBe(7)
  expect(rig.asked[0]).not.toContain('Armed')
})

it('says that what is read at start-up takes effect only after a restart, and not of what takes effect in flight', async () => {
  const { wrapper } = await screen()

  for (const id of ['INS_HNTCH_ENABLE', 'INS_HNTCH_MODE', 'INS_HNTCH_REF', 'INS_HNTCH_HMNCS', 'INS_HNTCH_OPTS']) {
    expect(wrapper.get(`[data-tune="${id}"] .tune-note`).text()).toContain('only after a restart')
  }

  for (const id of ['INS_HNTCH_FREQ', 'INS_HNTCH_BW', 'INS_HNTCH_ATT', 'INS_GYRO_FILTER']) {
    expect(wrapper.get(`[data-tune="${id}"] .tune-note`).text()).toBe('')
  }
})

it('turns off each parameter that is read at start-up while the vehicle is armed, and says why', async () => {
  const rig = await screen()
  await arm(rig)

  for (const id of ['INS_HNTCH_REF']) {
    expect(rig.wrapper.get(`[data-tune="${id}"] input[type="range"]`).attributes('disabled')).toBeDefined()
  }
  expect(rig.wrapper.get('[data-tune="INS_HNTCH_HMNCS"]').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-tune="INS_HNTCH_OPTS"]').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-tune="INS_HNTCH_ENABLE"] input').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-tune="INS_HNTCH_MODE"] input').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-tune="INS_HNTCH_HMNCS"] .tune-note').text()).toContain('not written while the vehicle is armed')
  expect(rig.wrapper.get('#tune-filters-armed').text()).toContain('Armed')

  // what takes effect in flight stays on
  for (const id of ['INS_HNTCH_FREQ', 'INS_HNTCH_BW', 'INS_HNTCH_ATT', 'INS_GYRO_FILTER']) {
    expect(rig.wrapper.get(`[data-tune="${id}"] input[type="range"]`).attributes('disabled')).toBeUndefined()
  }
})

it('writes what takes effect in flight while armed, after the hold that says the changes apply in flight', async () => {
  const rig = await screen()
  await arm(rig)
  await type(rig, 'INS_HNTCH_FREQ', '95')
  await write(rig)

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]?.split('\n')[0]).toBe('Armed: changes apply in flight.')
  expect(rig.asked[0]).toContain('INS_HNTCH_FREQ 80 → 95')
  expect(valueOf(rig, 'INS_HNTCH_FREQ')).toBe(95)
})

it('refuses a start-up parameter chosen while disarmed once the vehicle is armed (nothing is sent)', async () => {
  const rig = await screen()
  await rig.wrapper.findAll('[data-tune="INS_HNTCH_HMNCS"] input[type="checkbox"]')[2]?.setValue(true)
  await arm(rig)

  // the choice is still queued, the part will not write it, and the note says why
  expect(rig.wrapper.get('#tune-filters-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('.setup-writes li.refused').text()).toContain('INS_HNTCH_HMNCS')
  expect(valueOf(rig, 'INS_HNTCH_HMNCS')).toBe(3)
})

it('refuses a value below the least of a range while armed (a gyro cutoff of 0), and only warns disarmed', async () => {
  const rig = await screen()
  await type(rig, 'INS_GYRO_FILTER', '0')
  // disarmed it is only warned about, and written
  expect(rig.wrapper.get('[data-tune="INS_GYRO_FILTER"] .tune-note').text()).toContain('Outside the usual range')
  expect(rig.wrapper.get('#tune-filters-write').attributes('disabled')).toBeUndefined()
  await arm(rig)

  expect(rig.wrapper.get('[data-tune="INS_GYRO_FILTER"] .tune-note').text()).toContain('Below the least')
  expect(rig.wrapper.get('#tune-filters-write').attributes('disabled')).toBeDefined()
})

/** The vehicle's filters with a notch that is fixed (tracking mode Fixed), or that tracks. */
const FIXED = WITH_FILTERS.map(param => (param.id === 'INS_HNTCH_MODE' ? { ...param, value: 0 } : param))

it('refuses a gyro cutoff of 1 to 9 Hz while armed, and takes 10 Hz', async () => {
  const rig = await screen()
  await arm(rig)
  await type(rig, 'INS_GYRO_FILTER', '9')

  expect(rig.wrapper.get('[data-tune="INS_GYRO_FILTER"] .tune-note').text()).toContain('Below the least')
  expect(rig.wrapper.get('#tune-filters-write').attributes('disabled')).toBeDefined()
  await type(rig, 'INS_GYRO_FILTER', '10')

  expect(rig.wrapper.get('#tune-filters-write').attributes('disabled')).toBeUndefined()
})

it('does not check a notch that tracks against the peaks of the log, and says so', async () => {
  const rig = await screen()
  await rig.handle.spectrum.choose(LOG)
  await vi.waitFor(() => expect(rig.handle.spectrum.spectrum.value?.peak).toBeDefined())
  await flushPromises()
  // the vehicle's notch tracks the throttle (mode 1, reference 0.2): at 200 Hz it would miss 150 Hz, and nothing is said of that
  await type(rig, 'INS_HNTCH_FREQ', '200')

  expect(rig.wrapper.find('#tune-filters-misses').exists()).toBe(false)
  expect(rig.wrapper.get('#tune-filters-tracking').text()).toContain('does not check')
})

it('warns when a FIXED notch takes out none of the peaks of the log open in Spectrum, and not when it does', async () => {
  const rig = await screen(FIXED)
  expect(rig.wrapper.find('#tune-filters-misses').exists()).toBe(false)

  await rig.handle.spectrum.choose(LOG)
  await vi.waitFor(() => expect(rig.handle.spectrum.spectrum.value?.peak).toBeDefined())
  await flushPromises()
  // 80 Hz (60 to 100) and its second harmonic (120 to 200) hold the peak at 150 Hz
  expect(rig.wrapper.find('#tune-filters-misses').exists()).toBe(false)
  // 200 Hz (180 to 220) and 400 Hz (360 to 440) hold neither 150 Hz nor 300 Hz
  await type(rig, 'INS_HNTCH_FREQ', '200')
  expect(rig.wrapper.find('#tune-filters-misses').exists()).toBe(true)
  expect(rig.wrapper.get('#tune-filters-misses').text()).toContain('150')

  await type(rig, 'INS_HNTCH_FREQ', '150')
  expect(rig.wrapper.find('#tune-filters-misses').exists()).toBe(false)
})
