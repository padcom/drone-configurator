// "Flights": the logs on this computer, a log opened (progress, modes, three charts that share a cursor, the review), a log
// that is not verified (shown, with no review), and a log with no times (nothing to draw).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from '@/composables/useConfigurator'
import LogsFlights from './LogsFlights.vue'

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
 * @param localLogsStepMs how long a step of reading a log takes
 * @returns the wrapper and the handle
 */
async function screen(localLogsStepMs = 5) {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs }))
  // In the document: the focus is a fact of the page, and is looked at.
  mounted = mount(LogsFlights, { global: { plugins: [i18n] }, props: { section: 'flights' }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Opens the log in the row `index` and waits for it to be loaded.
 *
 * @param wrapper the screen
 * @param index the row
 */
async function open(wrapper: VueWrapper, index: number): Promise<void> {
  await wrapper.findAll('.flights-open')[index]?.trigger('click')
  await vi.waitFor(() => expect(wrapper.find('.flight-detail').exists()).toBe(true))
  await vi.waitFor(() => expect(wrapper.find('.flight-reading').exists()).toBe(false))
  await flushPromises()
}

/**
 * The text of each cell of each row of the table.
 *
 * @param wrapper the screen
 * @returns one list per row
 */
const cells = (wrapper: VueWrapper) => wrapper.findAll('tbody tr').map(row => row.findAll('th, td').map(cell => cell.text()))

it('lists the logs on this computer, newest first, none of them opened and none read on its own', async () => {
  const { wrapper } = await screen()

  // The state cell is the fifth; the duration (the fourth) is known only from a read, and is a dash until then.
  expect(cells(wrapper).map(row => [row[0], row[3], row[4]])).toEqual([
    ['3', '—', 'Not opened'], ['2', '—', 'Not opened'], ['1', '—', 'Not opened'], ['4', '—', 'Not opened'],
  ])
  expect(wrapper.find('.flight-detail').exists()).toBe(false)
  expect(wrapper.find('#flights-error').exists()).toBe(false)
})

it('opens a verified log: its length and firmware, the modes by name, four charts and the review in words', async () => {
  const { wrapper } = await screen()
  await open(wrapper, 0)

  expect(wrapper.get('.flight-detail-title').text()).toBe('Log 3')
  expect(wrapper.get('.flight-summary').text()).toBe('2:00 · 152,000 messages · ArduCopter V4.7.2 (fb773567)')
  expect(wrapper.findAll('.flight-mode-name').map(m => m.text())).toEqual(['Stabilize', 'Guided', 'Loiter', 'Land'])
  expect(wrapper.findAll('figure.kit-chart').map(chart => chart.get('.chart-title').text())).toEqual([
    'Attitude, deg', 'Altitude, m', 'Battery voltage, V', 'Vibration, m/s/s',
  ])
  expect(wrapper.find('#flights-not-verified').exists()).toBe(false)
  const lines = wrapper.findAll('.flight-finding').map(f => `${f.get('.flight-level').text()} ${f.get('.flight-text').text()}`)
  expect(lines).toHaveLength(11)
  // The board's wording: the peak, when, and the limit.
  expect(lines[0]).toBe('Check Vibration on X: peak 41 m/s², at 0:47, limit 30.')
  expect(lines[4]).toBe('OK GPS: never below 13 satellites, limit 12 (400 samples with a 3D fix).')
  expect(lines[9]).toContain('Info Battery: lowest pack voltage 14.9 V')
  // The review says its level with a glyph too, not by colour alone.
  expect(wrapper.findAll('.flight-glyph').map(g => g.text()).slice(0, 2)).toEqual(['⚠', '✓'])
  // The list now says what the read found.
  expect(cells(wrapper)[0]?.slice(3, 5)).toEqual(['2:00', 'Verified'])
})

it('shares one cursor between the charts', async () => {
  const { wrapper } = await screen()
  await open(wrapper, 0)

  const sliders = wrapper.findAll('[role="slider"]')
  expect(sliders).toHaveLength(4)
  await sliders[0]?.trigger('keydown', { key: 'Home' })
  await flushPromises()
  const readouts = wrapper.findAll('.chart-readout').map(r => r.text())
  // Every chart says something at the cursor, and the mode under it is marked.
  expect(readouts.every(text => text.length > 0)).toBe(true)
  expect(wrapper.findAll('.flight-mode.cursor')).toHaveLength(1)
})

it('opens a log that is not verified: the reason and the way to a checked copy, and nothing of its content', async () => {
  const { wrapper } = await screen()
  await open(wrapper, 1)

  expect(wrapper.get('#flights-not-verified').text()).toContain('Nothing is concluded from it')
  expect(wrapper.get('#flights-download-again').attributes('href')).toBe('#/logs/vehicle')
  expect(wrapper.findAll('.flight-finding')).toHaveLength(0)
  expect(wrapper.findAll('figure.kit-chart')).toHaveLength(0)
  expect(wrapper.find('.flight-summary').exists()).toBe(false)
  expect(wrapper.find('.flight-modes').exists()).toBe(false)
  // The list says so too, and has no duration for it.
  expect(cells(wrapper)[1]?.slice(3, 5)).toEqual(['—', 'Not verified'])
})

it('says a log has no times, and draws nothing, for one that has none', async () => {
  const { wrapper } = await screen()
  await open(wrapper, 3)

  const note = wrapper.get('.flight-detail p.muted:not(.flight-summary)')
  expect(note.text()).toBe('This log has no times, so there is nothing to draw.')
  expect(wrapper.findAll('figure.kit-chart')).toHaveLength(0)
  expect(wrapper.find('.flight-modes').exists()).toBe(false)
})

it('shows a bar while a log is read, and stops the read on request without an error', async () => {
  const { wrapper, handle } = await screen(100)
  await wrapper.findAll('.flights-open')[0]?.trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[role="progressbar"]').exists()).toBe(true))

  expect(wrapper.get('.flight-reading').text()).toContain('Reading log 3')
  // Nothing else can be opened while one is read: the buttons say so, and keep the focus (aria-disabled, not disabled).
  expect(wrapper.findAll('.flights-open').every(button => button.attributes('aria-disabled') === 'true')).toBe(true)
  expect(wrapper.findAll('.flights-open').some(button => button.attributes('disabled') !== undefined)).toBe(false)
  await wrapper.findAll('.flights-open')[1]?.trigger('click')
  expect(handle.flights.open.value).toBe('uid-mock/00000003-1a2b3c4d.BIN')
  await wrapper.get('#flights-stop').trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('idle'))
  await flushPromises()

  expect(wrapper.find('.flight-detail').exists()).toBe(false)
  expect(wrapper.find('#flights-error').exists()).toBe(false)
})

it('holds the charts back while the review and series are asked for (a line and Stop), and opens nothing else', async () => {
  const { wrapper, handle } = await screen(60)
  await wrapper.findAll('.flights-open')[0]?.trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('loading'), { interval: 5 })
  await flushPromises()

  // No chart that says "No data" before the data is asked for; a line says what is going on, and Stop is there.
  expect(wrapper.findAll('figure.kit-chart')).toHaveLength(0)
  expect(wrapper.get('.flight-reading').text()).toContain('Reading the charts and the review of log 3')
  expect(wrapper.find('#flights-stop').exists()).toBe(true)
  expect(wrapper.get('#flights-status').text()).toBe('Reading the charts and the review of log 3…')
  // Pressing Open meanwhile does nothing (it would fail with BUSY), and does not move the focus away.
  const [, second] = wrapper.findAll('.flights-open')
  expect(second?.attributes('aria-disabled')).toBe('true')
  await second?.trigger('click')
  expect(handle.flights.open.value).toBe('uid-mock/00000003-1a2b3c4d.BIN')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('ready'))
  await flushPromises()

  expect(handle.flights.error.value).toBeNull()
  expect(wrapper.findAll('figure.kit-chart')).toHaveLength(4)
})

/**
 * Gives an element the focus (the screen is in the document, so the focus is a fact of the page).
 *
 * @param element the element
 */
function focusOn(element: Element | undefined): void {
  if (element instanceof HTMLElement) {
    element.focus()
  }
}

it('keeps the focus on the button that was pressed while its read goes on (aria-disabled, not disabled)', async () => {
  const { wrapper, handle } = await screen(60)
  const [button] = wrapper.findAll('.flights-open')
  focusOn(button?.element)
  await button?.trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('reading'), { interval: 5 })

  expect(document.activeElement).toBe(button?.element)
})

it('points the buttons that are off at the line that says why; Stop keeps the focus from reading to loading', async () => {
  const { wrapper, handle } = await screen(60)
  await wrapper.findAll('.flights-open')[0]?.trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('reading'), { interval: 5 })
  focusOn(wrapper.get('#flights-stop').element)

  const described = [...wrapper.findAll('.flights-open'), wrapper.get('#flights-refresh')]
  expect(described.every(button => button.attributes('aria-describedby') === 'flights-busy')).toBe(true)
  expect(wrapper.get('#flights-busy').text()).toBe('Reading log 3…')
  // The read ends and the charts are asked for: Stop is still there, and still has the focus (it is not taken to the heading).
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('loading'), { interval: 5 })
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('#flights-stop').element)
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('ready'))
  await flushPromises()
  // Nothing is described any more when nothing is busy.
  expect(wrapper.findAll('.flights-open').some(button => button.attributes('aria-describedby') !== undefined)).toBe(false)
})

it('speaks the error of a log that failed to open once: in the status line, the banner only shows it', async () => {
  const { wrapper, handle } = await screen()
  await handle.flights.select('uid-mock/00000009-00000000.BIN')
  await flushPromises()

  const said = handle.flights.error.value ?? ''
  expect(said).toContain('NOT_FOUND')
  expect(wrapper.get('#flights-status').text()).toBe(said)
  expect(wrapper.get('#flights-error').text()).toBe(said)
  const speakers = wrapper.findAll('[role="status"], [role="alert"]').filter(element => element.text().includes(said))
  expect(speakers.map(element => element.attributes('id'))).toEqual(['flights-status'])
})

it('gives the focus to the heading of the log when Stop goes because the read is through', async () => {
  const { wrapper, handle } = await screen(60)
  await wrapper.findAll('.flights-open')[0]?.trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('reading'), { interval: 5 })
  focusOn(wrapper.get('#flights-stop').element)
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('ready'))
  await flushPromises()

  expect(document.activeElement).toBe(wrapper.get('.flight-detail-title').element)
})

it('gives the focus back to the button that opened the log when Stop is pressed and the log closes', async () => {
  const { wrapper, handle } = await screen(60)
  await wrapper.findAll('.flights-open')[0]?.trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('reading'), { interval: 5 })
  focusOn(wrapper.get('#flights-stop').element)
  await wrapper.get('#flights-stop').trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('idle'))
  await flushPromises()

  expect(document.activeElement).toBe(wrapper.findAll('.flights-open')[0]?.element)
})

it('says in an always-present polite status that a read finished, was stopped or failed', async () => {
  const { wrapper, handle } = await screen(20)
  const status = () => wrapper.get('#flights-status')

  // There from the start, with nothing to say.
  expect(status().attributes('role')).toBe('status')
  expect(status().text()).toBe('')
  await open(wrapper, 0)
  expect(status().text()).toBe('Log 3 is open.')
  // Stopped.
  await wrapper.findAll('.flights-open')[1]?.trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('reading'), { interval: 2 })
  await wrapper.get('#flights-stop').trigger('click')
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('idle'))
  await flushPromises()
  expect(status().text()).toBe('Reading stopped.')
})

it('marks the mode under the cursor by aria-current and in words, and reads a thinned part as a range', async () => {
  const { wrapper } = await screen()
  await open(wrapper, 0)

  await wrapper.findAll('[role="slider"]')[0]?.trigger('keydown', { key: 'Home' })
  await flushPromises()
  const marked = wrapper.findAll('.flight-mode[aria-current="true"]')
  expect(marked).toHaveLength(1)
  expect(marked[0]?.text()).toContain('under the cursor')
  // A part that has several samples reads as a range (the line goes through the middle, which no sample had).
  const readouts = wrapper.findAll('.chart-readout').map(r => r.text())
  expect(readouts.some(text => text.includes(' … '))).toBe(true)
})

it('says there are no logs on this computer, and why the list failed', async () => {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, withoutLogs: true }))
  mounted = mount(LogsFlights, { global: { plugins: [i18n] }, props: { section: 'flights' } })
  await flushPromises()

  expect(handle.flights.error.value).toContain('UNKNOWN_METHOD')
  expect(mounted.get('#flights-error').text()).toContain('UNKNOWN_METHOD')
})
