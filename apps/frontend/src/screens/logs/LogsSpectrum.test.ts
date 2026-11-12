// "Spectrum": a log is chosen and its raw IMU batches are listed; the spectrum of a sensor is drawn with its peak and harmonics
// and a
// spectrogram; the notch as entered is drawn over it; the values the peak suggests are queued, never written, and flagged for a
// vehicle of another kind; a log with no batch says how to capture one, and a spectrum of nothing is not drawn.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import type { Param } from '@/generated/app'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { VEHICLE } from '@/mock/fixtures'
import { createConfigurator } from '@/composables/useConfigurator'
import { feed } from '@/testing/testing'
import LogsSpectrum from './LogsSpectrum.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** The key of the mock's logs: 3 has batches, 1 has none. */
const WITH_BATCHES = 'uid-mock/00000003-1a2b3c4d.BIN'
const WITHOUT = 'uid-mock/00000001-1a2b3c4d.BIN'

/**
 * A parameter of the vehicle.
 *
 * @param id its name
 * @param value its value
 * @param index its place in the list
 * @returns the parameter
 */
const param = (id: string, value: number, index: number): Param => ({ id, kind: 'int', type: 'INT32', value, index })

const NOTCH_PARAMS: Param[] = [
  param('INS_HNTCH_ENABLE', 0, 0),
  param('INS_HNTCH_FREQ', 80, 1),
  param('INS_HNTCH_BW', 40, 2),
  param('INS_HNTCH_ATT', 40, 3),
  param('INS_HNTCH_HMNCS', 1, 4),
]

/**
 * The screen over the mock, with the list of logs read.
 *
 * @param options what the vehicle has
 * @param options.type the type of the connected vehicle, none for no vehicle
 * @returns the wrapper and the handle
 */
async function screen(options: { type?: string } = {}) {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 1 }))
  await flushPromises()

  if (options.type !== undefined) {
    const vehicle = { ...VEHICLE, type: options.type } as unknown as typeof VEHICLE
    feed(handle, { params: NOTCH_PARAMS, list: 'complete', connection: { state: 'connected', vehicle } })
  }
  mounted = mount(LogsSpectrum, { global: { plugins: [i18n] }, props: { section: 'spectrum' }, attachTo: document.body })
  await vi.waitFor(() => expect(handle.flights.listed.value).toBe(true))
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Chooses a log and waits for its spectrum.
 *
 * @param wrapper the screen
 * @param key the log
 */
async function open(wrapper: VueWrapper, key: string): Promise<void> {
  await wrapper.get('#spectrum-log').setValue(key)
  await vi.waitFor(() => expect(wrapper.find('#spectrum-busy').exists()).toBe(false))
  await flushPromises()
}

/**
 * The text of each row of the peak table.
 *
 * @param wrapper the screen
 * @returns the cells of each row, joined
 */
function peakRows(wrapper: VueWrapper): string[] {
  const rows = wrapper.findAll('.spectrum-peak tbody tr')

  return rows.map(row => row.findAll('th, td').map(cell => cell.text()).join(' '))
}

it('says what is needed before a log is chosen', async () => {
  const { wrapper } = await screen()

  expect(wrapper.text()).toContain('No log chosen')
  expect(wrapper.find('.spectrum-chart').exists()).toBe(false)
})

it('draws the spectrum of the first gyro, with its peak and harmonic in a table, and the spectrogram', async () => {
  const { wrapper } = await screen()
  await open(wrapper, WITH_BATCHES)

  expect(wrapper.findAll('.spectrum-chart .chart-series').length).toBe(3)
  expect(wrapper.get('.spectrum-chart svg').attributes('aria-label')).toBe('Peak at 150 Hz, amplitude 2.00 rad/s')
  expect(peakRows(wrapper)).toEqual(['Peak on X 150.0 2.000', 'Harmonic 2× 300.0 0.500'])
  expect(wrapper.get('.spectrogram canvas').attributes('aria-label')).toContain('60 rows')
  expect(wrapper.get('.spectrum-facts').text()).toContain('120 batches used, 0 skipped')
  expect(wrapper.get('.spectrum-facts').text()).toContain('1,024 samples')
})

it('shows the other sensor in its unit, with no values suggested from an accelerometer', async () => {
  const { wrapper } = await screen()
  await open(wrapper, WITH_BATCHES)
  expect(wrapper.find('#spectrum-suggest').exists()).toBe(true)

  await wrapper.get('#spectrum-source').setValue('accel:0')
  await vi.waitFor(() => expect(wrapper.find('#spectrum-busy').exists()).toBe(false))
  await flushPromises()

  expect(wrapper.get('.spectrum-chart .chart-title').text()).toContain('m/s/s')
  expect(wrapper.find('#spectrum-suggest').exists()).toBe(false)
  expect(wrapper.get('#spectrum-accel-note').text()).toContain('gyro')
})

it('says how to capture a batch for a log that has none, and draws nothing', async () => {
  const { wrapper } = await screen()
  await open(wrapper, WITHOUT)

  expect(wrapper.get('#spectrum-none').text()).toContain('no raw IMU batches')
  expect(wrapper.get('#spectrum-none').text()).toContain('INS_LOG_BAT_MASK')
  expect(wrapper.get('#spectrum-capture').attributes('href')).toBe('#/logs/tools')
  expect(wrapper.find('.spectrum-chart').exists()).toBe(false)
  expect(wrapper.find('.spectrogram').exists()).toBe(false)
})

it('does not draw a spectrum of nothing but zeros, and suggests nothing from it', async () => {
  const { wrapper, handle } = await screen({ type: 'QUADROTOR' })
  await open(wrapper, WITH_BATCHES)
  const shown = handle.spectrum.spectrum.value as NonNullable<typeof handle.spectrum.spectrum.value>
  // Every sample zero: no peak either.
  handle.spectrum.spectrum.value = { ...shown, silent: true, peak: undefined }
  await flushPromises()

  expect(wrapper.get('#spectrum-silent').text()).toContain('zero')
  expect(wrapper.find('.spectrum-chart').exists()).toBe(false)
  expect(wrapper.find('#spectrum-suggest').exists()).toBe(false)
})

it('draws the bands of the notch as entered over the spectrum, and none for what is not a notch', async () => {
  const { wrapper } = await screen()
  await open(wrapper, WITH_BATCHES)
  const bands = () => wrapper.findAll('.spectrum-band').length

  // ArduPilot's defaults: 80 Hz, harmonics 3 (the base and the second).
  expect(wrapper.get('#spectrum-notch').text()).toContain('ArduPilot')
  expect(bands()).toBe(2)
  await wrapper.get('#notch-harmonics').setValue('1')
  expect(bands()).toBe(1)
  await wrapper.get('#notch-freq').setValue('150')
  expect(wrapper.get('.spectrum-band').attributes('x')).not.toBe('0')
  await wrapper.get('#notch-freq').setValue('')
  expect(bands()).toBe(0)
})

it('starts the notch from the vehicle\'s own values when it has them', async () => {
  const { wrapper } = await screen({ type: 'QUADROTOR' })
  await open(wrapper, WITH_BATCHES)

  expect(wrapper.get('#spectrum-notch').text()).toContain('values on the vehicle')
  expect((wrapper.get('#notch-freq').element as HTMLInputElement).value).toBe('80')
  expect((wrapper.get('#notch-harmonics').element as HTMLInputElement).value).toBe('1')
})

it('lists the suggested values with where they come from, and queues them without writing', async () => {
  const { wrapper, handle } = await screen({ type: 'QUADROTOR' })
  await open(wrapper, WITH_BATCHES)

  expect(wrapper.get('#spectrum-suggest').text()).toContain('From log 3, Gyro 0')
  expect(wrapper.findAll('.spectrum-suggestions tbody tr').map(row => row.findAll('th, td').slice(0, 3).map(cell => cell.text())))
    .toEqual([
      ['INS_HNTCH_ENABLE', '0', '1'],
      ['INS_HNTCH_FREQ', '80', '150'],
      ['INS_HNTCH_BW', '40', '75'],
      ['INS_HNTCH_HMNCS', '1', '3'],
    ])
  expect(wrapper.find('#spectrum-different').exists()).toBe(false)
  expect(handle.staged.pending()).toEqual([])

  await wrapper.get('#spectrum-add').trigger('click')
  await flushPromises()

  expect(handle.staged.pending().map(change => [change.id, change.from, change.to]))
    .toEqual([['INS_HNTCH_ENABLE', 0, 1], ['INS_HNTCH_FREQ', 80, 150], ['INS_HNTCH_BW', 40, 75], ['INS_HNTCH_HMNCS', 1, 3]])
  expect(wrapper.get('#spectrum-suggest-status').text()).toBe('Added 4 changes to the list.')
  // They are in the list of changes, where they are written after a question: the parameters are as they were.
  expect(handle.parameters.params.value.find(p => p.id === 'INS_HNTCH_FREQ')?.value).toBe(80)
})

it('needs a second press that names both vehicles when the log is of another kind than the one connected', async () => {
  const { wrapper, handle } = await screen({ type: 'FIXED_WING' })
  await open(wrapper, WITH_BATCHES)

  expect(wrapper.get('#spectrum-different').text()).toContain('ArduCopter')
  expect(wrapper.get('#spectrum-different').text()).toContain('ArduPlane')
  await wrapper.get('#spectrum-add').trigger('click')
  expect(wrapper.get('#spectrum-add').text()).toBe('Confirm: add values from a ArduCopter log to a ArduPlane')
  expect(handle.staged.pending()).toEqual([])
  await new Promise(resolve => {
    setTimeout(resolve, 450)
  })
  await wrapper.get('#spectrum-add').trigger('click')
  await flushPromises()

  expect(handle.staged.pending().length).toBe(4)
})

it('cannot add the values without a vehicle, and says so', async () => {
  const { wrapper, handle } = await screen()
  await open(wrapper, WITH_BATCHES)

  expect(wrapper.get('#spectrum-suggest-offline').text()).toContain('Connect the vehicle')
  expect(wrapper.find('#spectrum-add').exists()).toBe(false)
  expect(handle.staged.pending()).toEqual([])
})
