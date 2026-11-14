// "Analyse the last flight" against the mock backend: the newest log is preselected; Analyse lists the steps of the mock flight
// (roll: 57, -47 and -40 deg/s; pitch: 30 and -30; yaw: none) with the numbers measured of each, and draws the largest; another
// step or axis can be chosen; a log with no RATE names the bits of LOG_BITMASK; a log with no step says so; a recording is not
// offered; and a log of another kind of vehicle than the connected one is labelled.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { VEHICLE } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'
import TuneAnalyse from './TuneAnalyse.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** The logs of the mock: 3 is the newest, 4 has no times (and no RATE), the recording is not a flight log. */
const NEWEST = 'uid-mock/00000003-1a2b3c4d.BIN'
const NO_TIMES = 'uid-mock/00000004-1a2b3c4d.BIN'

/**
 * The screen over the mock, with the list of logs read.
 *
 * @param type the type of the vehicle that is connected (none for no vehicle)
 * @returns the wrapper and the handle
 */
async function screen(type?: string) {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 1 }))
  await flushPromises()

  if (type !== undefined) {
    feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE, type } as unknown as typeof VEHICLE } })
  }
  mounted = mount(TuneAnalyse, { global: { plugins: [i18n] }, attachTo: document.body })
  await vi.waitFor(() => expect(handle.flights.listed.value).toBe(true))
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Presses Analyse and waits for the passes to end.
 *
 * @param wrapper the screen
 * @param handle the configurator
 */
async function analyse(wrapper: VueWrapper, handle: ReturnType<typeof createConfigurator>): Promise<void> {
  await wrapper.get('#tune-analyse-run').trigger('click')
  await vi.waitFor(() => expect(['ready', 'none', 'failed']).toContain(handle.analysis.phase.value))
  await flushPromises()
}

/**
 * The size column of the steps table.
 *
 * @param wrapper the screen
 * @returns the texts
 */
const sizes = (wrapper: VueWrapper) => wrapper.findAll('#tune-analyse-steps tbody tr td:nth-child(2)').map(cell => cell.text())

it('has the newest log chosen, and reads nothing until Analyse is pressed', async () => {
  const { wrapper, handle } = await screen()

  expect(wrapper.get('#tune-analyse-log').element).toHaveProperty('value', NEWEST)
  expect(handle.analysis.phase.value).toBe('idle')
  expect(wrapper.text()).toContain('Nothing analysed yet')
})

it('lists the steps of the roll axis, the largest first, with what was measured of each, and draws the largest', async () => {
  const { wrapper, handle } = await screen()
  await analyse(wrapper, handle)

  expect(sizes(wrapper)).toEqual(['57 °/s', '-47 °/s', '-40 °/s'])
  expect(wrapper.get('#tune-analyse-step-0').attributes('aria-pressed')).toBe('true')
  expect(wrapper.find('#tune-analyse-chart').exists()).toBe(true)
  expect(wrapper.get('#tune-analyse-overshoot').text()).not.toBe('—')
  expect(wrapper.get('#tune-analyse-step').text()).toContain('0 to 57')
})

it('draws another step when it is chosen', async () => {
  const { wrapper, handle } = await screen()
  await analyse(wrapper, handle)
  await wrapper.get('#tune-analyse-step-1').trigger('click')

  expect(wrapper.get('#tune-analyse-step-1').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('#tune-analyse-step-0').attributes('aria-pressed')).toBe('false')
  expect(wrapper.get('#tune-analyse-step').text()).toContain('57 to 10')
})

it('looks at another axis of the same log', async () => {
  const { wrapper, handle } = await screen()
  await analyse(wrapper, handle)
  expect(wrapper.get('#tune-analyse-axis-roll').attributes('aria-pressed')).toBe('true')

  await wrapper.get('#tune-analyse-axis-pitch').trigger('click')
  await vi.waitFor(() => expect(handle.analysis.phase.value).toBe('ready'))
  await flushPromises()

  expect(wrapper.get('#tune-analyse-axis-pitch').attributes('aria-pressed')).toBe('true')
  expect(sizes(wrapper)).toEqual(['30 °/s', '-30 °/s'])
})

it('says there is no suitable step when the axis has none (yaw of the mock flight is flat)', async () => {
  const { wrapper, handle } = await screen()
  await analyse(wrapper, handle)
  await wrapper.get('#tune-analyse-axis-yaw').trigger('click')
  await vi.waitFor(() => expect(handle.analysis.phase.value).toBe('none'))
  await flushPromises()

  expect(wrapper.get('#tune-analyse-none').text()).toContain('No suitable step in this log')
  expect(wrapper.find('#tune-analyse-chart').exists()).toBe(false)
})

it('names the bits of LOG_BITMASK that make the vehicle log RATE, when the log has none', async () => {
  const { wrapper, handle } = await screen()
  await wrapper.get('#tune-analyse-log').setValue(NO_TIMES)
  await analyse(wrapper, handle)

  const none = wrapper.get('#tune-analyse-none').text()
  expect(none).toContain('no RATE messages')
  expect(none).toContain('ATTITUDE_FAST')
  expect(none).toContain('ATTITUDE_MED')
})

it('does not offer a recording, and says it is not available for one', async () => {
  const { wrapper, handle } = await screen()
  await handle.flights.importFile()
  await vi.waitFor(() => expect(handle.flights.logs.value.some(log => log.source === 'tlog')).toBe(true))
  await flushPromises()
  const options = wrapper.findAll('#tune-analyse-log option').map(option => option.element.getAttribute('value'))

  expect(options).not.toContain('imported/00000000-5eed5eed.tlog')
  expect(wrapper.get('#tune-analyse-tlog').text()).toContain('Not available for a recording')
})

it('labels a log from another kind of vehicle than the connected one, and not one from the same kind', async () => {
  const other = await screen('FIXED_WING')
  await analyse(other.wrapper, other.handle)
  expect(other.wrapper.get('#tune-analyse-different').text()).toContain('ArduPlane')
  other.wrapper.unmount()

  const same = await screen('QUADROTOR')
  await analyse(same.wrapper, same.handle)
  expect(same.wrapper.find('#tune-analyse-different').exists()).toBe(false)
})

it('says nothing about the kind of vehicle when none is connected', async () => {
  const { wrapper, handle } = await screen()
  await analyse(wrapper, handle)

  expect(wrapper.find('#tune-analyse-different').exists()).toBe(false)
})
