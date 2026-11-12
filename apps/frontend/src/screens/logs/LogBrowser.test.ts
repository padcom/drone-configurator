// The message browser and the export of an open flight log: the kinds of message with their counts, the fields of one kind at
// the cursor (the last message of each instance, with units), a field pressed to chart it, an array that is never offered as a
// number, and the export: CSV, GPX, KML, a file that is there named and replaced only by a second press, and a log with no track.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from '@/composables/useConfigurator'
import LineChart from '@/components/charts/LineChart.vue'
import LogsFlights from './LogsFlights.vue'

/**
 * Waits for an expectation, longer than vitest's second (the passes behind it are timers, and a loaded machine is slow).
 *
 * @param check the expectation
 * @returns when it holds
 */
function waitFor(check: () => void): Promise<void> {
  return vi.waitFor(check, { timeout: 5000 })
}

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/**
 * Opens the log in the row `index` of the Flights screen over the mock, and waits until its kinds of message are listed.
 *
 * @param index the row (0 is log 3, which has a GPS track; 2 is log 1, which has none)
 * @returns the wrapper and the handle
 */
async function opened(index: number) {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 1 }))
  mounted = mount(LogsFlights, { global: { plugins: [i18n] }, props: { section: 'flights' }, attachTo: document.body })
  await flushPromises()
  await mounted.findAll('.flights-open')[index]?.trigger('click')
  await waitFor(() => expect(mounted?.find('#browser-kind').exists()).toBe(true))
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Moves the cursor of the charts to a place along the log, as the pointer or the keys would.
 *
 * @param wrapper the screen
 * @param seconds seconds from the start of the log
 */
async function moveTo(wrapper: VueWrapper, seconds: number): Promise<void> {
  wrapper.findAllComponents(LineChart)[0]?.vm.$emit('update:cursor', seconds)
  await flushPromises()
}

/**
 * Chooses a kind of message.
 *
 * @param wrapper the screen
 * @param kind its name
 */
async function choose(wrapper: VueWrapper, kind: string): Promise<void> {
  await wrapper.get('#browser-kind').setValue(kind)
  await flushPromises()
}

/**
 * The rows of the table of fields, as "name: value".
 *
 * @param wrapper the screen
 * @returns one line for each field
 */
function fieldsOf(wrapper: VueWrapper): string[] {
  const rows = wrapper.findAll('.browser-fields tbody tr')

  return rows.map(row => `${row.get('th').text()}: ${row.get('.browser-value').text()}`)
}

/**
 * What the export says.
 *
 * @param wrapper the screen
 * @returns the status line
 */
const exportSays = (wrapper: VueWrapper) => wrapper.get('#export-status').text()

it('lists the kinds of message with how many there are of each, and asks for none until one is chosen', async () => {
  const { wrapper } = await opened(0)

  const options = wrapper.findAll('#browser-kind option').map(option => option.text())
  expect(options).toEqual(['Choose…', 'ATT (12,000)', 'BAT (2,400)', 'ISBD (400)', 'MSG (12)'])
  expect(wrapper.get('#browser-kind').element).toHaveProperty('value', '')
  expect(wrapper.text()).toContain('Choose a kind of message')
})

it('asks the log for the fields at the cursor, with the unit the log names, and again where the cursor moves', async () => {
  const { wrapper } = await opened(0)

  await choose(wrapper, 'ATT')
  expect(wrapper.get('#browser-cursor-hint').text()).toContain('Move the cursor')
  await moveTo(wrapper, 30)
  await waitFor(() => expect(fieldsOf(wrapper).length).toBe(3))

  const [time, roll] = fieldsOf(wrapper)
  expect(time).toBe('TimeUS: 31,000,000')
  // 10 sin(30 / 6) = -9.589 degrees.
  expect(roll).toBe('Roll: -9.589 deg')
  await moveTo(wrapper, 60)
  await waitFor(() => expect(fieldsOf(wrapper)[0]).toBe('TimeUS: 61,000,000'))
})

it('lets the instance be chosen where the kind has several, and shows the one chosen', async () => {
  const { wrapper } = await opened(0)
  await choose(wrapper, 'BAT')
  await moveTo(wrapper, 10)
  await waitFor(() => expect(wrapper.find('#browser-instance').exists()).toBe(true))

  expect(wrapper.findAll('#browser-instance option').map(option => option.text())).toEqual(['0', '1'])
  const first = fieldsOf(wrapper).find(line => line.startsWith('Volt'))
  await wrapper.get('#browser-instance').setValue('1')
  const second = fieldsOf(wrapper).find(line => line.startsWith('Volt'))

  expect(first).toBe('Volt: 16.600 V')
  expect(second).toBe('Volt: 20.600 V')
})

it('says there is nothing yet for a time before the first message, not a zero', async () => {
  const { wrapper } = await opened(0)
  await choose(wrapper, 'ATT')
  await moveTo(wrapper, -5)
  await waitFor(() => expect(wrapper.find('#browser-nothing').exists()).toBe(true))

  expect(wrapper.get('#browser-nothing').text()).toContain('ATT has no message yet')
  expect(wrapper.find('.browser-fields').exists()).toBe(false)
})

it('charts a field that is pressed, with its unit, and offers no chart for a text or for an array', async () => {
  const { wrapper } = await opened(0)
  await choose(wrapper, 'ATT')
  await moveTo(wrapper, 30)
  await waitFor(() => expect(fieldsOf(wrapper).length).toBe(3))

  await wrapper.get('[data-field="Roll"] .browser-graph').trigger('click')
  await waitFor(() => expect(wrapper.findAll('.kit-chart').length).toBe(5))
  expect(wrapper.findAll('.chart-title').map(title => title.text())).toContain('ATT.Roll, deg')

  // MSG has a text, which is not a value; ISBD's arrays are not fields of the row at all.
  await choose(wrapper, 'MSG')
  await moveTo(wrapper, 31)
  await waitFor(() => expect(fieldsOf(wrapper).length).toBe(2))
  expect(wrapper.find('[data-field="Message"] .browser-graph').exists()).toBe(false)
  await choose(wrapper, 'ISBD')
  await moveTo(wrapper, 32)
  await waitFor(() => expect(fieldsOf(wrapper)).toEqual(['TimeUS: 33,000,000']))
  expect(wrapper.text()).not.toContain('x:')
})

it('saves a CSV of the chosen kind, says how many rows, and does not ask for a kind it was not given', async () => {
  const { wrapper } = await opened(0)

  expect(wrapper.get('#export-csv').attributes('aria-disabled')).toBe('true')
  await wrapper.get('#export-csv').trigger('click')
  await flushPromises()
  expect(wrapper.get('#export-status').text()).toBe('')

  await choose(wrapper, 'ATT')
  await wrapper.get('#export-csv').trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('Saved 00000003-ATT.csv: 12,000 rows'))
  expect(wrapper.find('#export-replace').exists()).toBe(false)
})

it('never replaces a file by the first press: it names the file, and a second press that names it replaces it', async () => {
  const { wrapper } = await opened(0)
  await choose(wrapper, 'ATT')
  await wrapper.get('#export-csv').trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('Saved'))

  await wrapper.get('#export-csv').trigger('click')
  await waitFor(() => expect(exportSays(wrapper)).toBe('00000003-ATT.csv already exists. Nothing was written.'))
  const second = wrapper.get('#export-replace')
  expect(second.text()).toBe('Replace the file')

  // The first press only says what it will do, naming the file; the second one, after a moment, does it.
  await second.trigger('click')
  expect(second.text()).toBe('Confirm: replace 00000003-ATT.csv')
  expect(wrapper.get('#export-status').text()).toContain('already exists')
  await new Promise(resolve => {
    setTimeout(resolve, 450)
  })
  await second.trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('Saved 00000003-ATT.csv'))
  expect(wrapper.find('#export-replace').exists()).toBe(false)
})

it('saves the GPS track as GPX and KML for a log that has one', async () => {
  const { wrapper } = await opened(0)

  await wrapper.get('#export-gpx').trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('Saved 00000003.gpx: 1,500 rows'))
  await wrapper.get('#export-kml').trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('Saved 00000003.kml'))
})

it('says GPX and KML are not available for a log with no position fixes, and why, and writes nothing', async () => {
  const { wrapper } = await opened(2)

  await wrapper.get('#export-gpx').trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('GPX is not available for this log'))
  expect(wrapper.get('#export-status').text()).toContain('no GPS position with a 3D fix')
  await wrapper.get('#export-kml').trigger('click')
  await waitFor(() => expect(wrapper.get('#export-status').text()).toContain('KML is not available'))
  expect(wrapper.find('#export-replace').exists()).toBe(false)
})

it('is not there for a log that is not verified: nothing is looked into it', async () => {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 1 }))
  mounted = mount(LogsFlights, { global: { plugins: [i18n] }, props: { section: 'flights' }, attachTo: document.body })
  await flushPromises()
  await mounted.findAll('.flights-open')[1]?.trigger('click')
  await waitFor(() => expect(mounted?.find('#flights-not-verified').exists()).toBe(true))
  await flushPromises()

  expect(mounted.find('#log-browser').exists()).toBe(false)
  expect(handle.browser.types.value).toEqual([])
})
