// "Flights", a recording opened with "Open log file…": it is imported, listed as imported, opened with the mark that it
// was not checked against a vehicle (the page cannot drop it), the reader's report in words with a cut end as a normal end,
// no data for what a recording cannot say, and the same content twice is one entry.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from '@/composables/useConfigurator'
import LogsFlights from './LogsFlights.vue'
import LogsSpectrum from './LogsSpectrum.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/**
 * The screen over the mock.
 *
 * @returns the wrapper and the handle
 */
async function screen() {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 5 }))
  mounted = mount(LogsFlights, { global: { plugins: [i18n] }, props: { section: 'flights' }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Presses "Open log file…" and waits until the imported log is loaded.
 *
 * @param wrapper the screen
 */
async function importIt(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('#flights-import').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('.flight-detail').exists()).toBe(true))
  await vi.waitFor(() => expect(wrapper.find('.flight-reading').exists()).toBe(false))
  await flushPromises()
}

it('imports a recording from the button, opens it and marks it as not checked against a vehicle', async () => {
  const { wrapper } = await screen()
  await importIt(wrapper)

  expect(wrapper.get('.flight-detail-title').text()).toBe('Imported log file #0')
  expect(wrapper.get('#flights-imported-mark').text()).toBe(
    'Imported, not checked against a vehicle. Values are as recorded by the program that wrote the file.',
  )
  expect(wrapper.get('#flights-status').text()).toBe('Imported flight.tlog and opened it.')
  // The list has it, as imported, with its state.
  const rows = wrapper.findAll('tbody tr').map(row => row.findAll('th, td').map(cell => cell.text()))
  expect(rows[0]?.[0]).toBe('Imported #0')
  expect(rows[0]?.[4]).toBe('Imported, copy intact')
  // The mark is not on a log a vehicle wrote.
  await wrapper.findAll('.flights-open')[1]?.trigger('click')
  await vi.waitFor(() => expect(wrapper.get('.flight-detail-title').text()).toBe('Log 3'))
  await vi.waitFor(() => expect(wrapper.find('.flight-reading').exists()).toBe(false))
  expect(wrapper.find('#flights-imported-mark').exists()).toBe(false)
})

it('says why a recording with no vehicle heartbeat has no charts', async () => {
  const { wrapper, handle } = await screen()
  await importIt(wrapper)
  const summary = handle.flights.summary.value
  expect(summary?.report).toBeDefined()
  handle.flights.summary.value = { ...summary!, report: { ...summary!.report!, vehicles: 0 } }
  await flushPromises()

  expect(wrapper.get('#flights-no-vehicle').text()).toContain('No vehicle heartbeat in this recording')
})

it('says what the reader found, with a cut end as a normal end and unknown messages not as damage', async () => {
  const { wrapper } = await screen()
  await importIt(wrapper)

  const report = wrapper.get('#flights-report').text()
  expect(report).toContain('Records read: 5,230.')
  expect(report).toContain('Skipped: 0 bytes of damage, 0 frames with a wrong checksum,')
  expect(report).toContain('3 frames of message types this app does not know.')
  expect(wrapper.get('#flights-cut-end').text()).toContain('it is not damage')
  // Two vehicles: the views are of the first, and the page says so. The browser says kinds are not listed.
  expect(wrapper.get('#flights-vehicles').text()).toBe(
    'Vehicles in the recording: 2. The charts, modes and review are of the first one (system 1, component 1).',
  )
  await vi.waitFor(() => expect(wrapper.find('#browser-more').exists()).toBe(true))
  expect(wrapper.get('#browser-more').text()).toBe('More kinds of message are not listed: 3.')
  // Three unknown frames are counted in the report and are not damage.
  expect(wrapper.find('#flights-damaged').exists()).toBe(false)
})

it('says no data for what a recording cannot say, and that the review rests on ground-station samples', async () => {
  const { wrapper } = await screen()
  await importIt(wrapper)

  const lines = wrapper.findAll('.flight-finding').map(f => `${f.get('.flight-level').text()} ${f.get('.flight-text').text()}`)
  expect(lines.some(line => line.startsWith('OK Vibration on X'))).toBe(true)
  const noData = lines.filter(line => line.toLowerCase().includes('no data'))
  expect(noData.length).toBeGreaterThanOrEqual(2)
  expect(wrapper.get('#flights-review-tlog').text()).toContain('ground station')
})

it('opens the same recording again as the entry that is there, and says so', async () => {
  const { wrapper, handle } = await screen()
  await importIt(wrapper)
  // The detail of the first import is still on the page: wait for the second import itself to be through (it says it found the
  // entry, and the log is loaded again), not for a moment.
  await wrapper.get('#flights-import').trigger('click')
  await vi.waitFor(() => expect(handle.flights.imported.value?.duplicate).toBe(true))
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('ready'))
  await flushPromises()

  expect(handle.flights.logs.value.filter(log => log.source === 'tlog')).toHaveLength(1)
  expect(wrapper.get('#flights-status').text()).toBe('flight.tlog is in the library already (same content): opened that one.')
})

it('shows the progress of an import with Stop, and ignores a second press while it runs', async () => {
  const { wrapper, handle } = await screen()
  await wrapper.get('#flights-import').trigger('click')
  await vi.waitFor(() => expect(handle.flights.importing.value).toBe(true), { interval: 1 })

  expect(wrapper.find('#flights-importing').exists()).toBe(true)
  expect(wrapper.get('#flights-stop').text()).toBe('Stop import')
  expect(wrapper.get('#flights-import').attributes('aria-disabled')).toBe('true')
  await wrapper.get('#flights-import').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('#flights-importing').exists()).toBe(false))
  await flushPromises()
})

it('tells the Spectrum tab that a recording has no raw IMU batches, and does not offer it', async () => {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 5 }))
  await handle.flights.importFile()
  await flushPromises()
  mounted = mount(LogsSpectrum, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  expect(mounted.get('#spectrum-tlog').text()).toContain('Not available for a log file (.tlog)')
  const options = mounted.findAll('#spectrum-log option, [role="option"]').map(o => o.text())
  expect(options.some(text => text.includes('Imported'))).toBe(false)
})
