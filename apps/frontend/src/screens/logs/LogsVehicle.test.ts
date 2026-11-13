// "On the vehicle": the table, the selection, the download with the mock, and the safety register (no download on its own, none
// while armed or not known to be disarmed, erase as a second press that names what happens, and last).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from '@/composables/useConfigurator'
import { feed } from '@/testing/testing'
import LogsVehicle from './LogsVehicle.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  vi.restoreAllMocks()
})

/**
 * Connects the simulated vehicle, and says it is disarmed, when asked to.
 *
 * @param handle the Configurator
 * @param connect whether to connect
 */
async function connectIf(handle: ReturnType<typeof createConfigurator>, connect: boolean): Promise<void> {
  if (connect) {
    await handle.vehicle.connect({ transport: 'simulator' })
    feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  }
}

/**
 * The screen with a vehicle connected and (unless told otherwise) known to be disarmed.
 *
 * @param connect whether to connect the vehicle
 * @param more more of the mock's options
 * @returns the wrapper and the handle
 */
async function screen(connect = true, more: MockOptions = {}) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, logs: { steps: 2, intervalMs: 5 }, control, ...more }))
  control.armed?.(false)

  await connectIf(handle, connect)
  mounted = mount(LogsVehicle, { global: { plugins: [i18n] }, props: { section: 'vehicle' } })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/** Two logs, both downloaded and checked: an erase may be sent. */
const ALL_CHECKED = {
  steps: 2,
  intervalMs: 5,
  logs: [{ id: 1, size: 1000, downloaded: true }, { id: 2, size: 2000, downloaded: true }],
}

/**
 * The text of each cell of a row.
 *
 * @param wrapper the screen
 * @returns one list per row
 */
const cells = (wrapper: VueWrapper) => wrapper.findAll('tbody tr').map(row => row.findAll('th, td').map(cell => cell.text()))

it('says a vehicle must be connected, with no table, when none is', async () => {
  const { wrapper } = await screen(false)

  expect(wrapper.get('.kit-empty .title').text()).toBe('No vehicle is connected')
  expect(wrapper.find('table').exists()).toBe(false)
  expect(wrapper.find('#logs-erase').exists()).toBe(false)
})

it('lists the logs in a table of number, date, size and state, and the sum of the sizes (never "of" a total)', async () => {
  const { wrapper } = await screen()

  expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['Select', 'Log', 'Last changed', 'Size', 'State'])
  expect(cells(wrapper).map(row => [row[1], row[3], row[4]])).toEqual([
    ['1', '1.2 MB', 'Not downloaded'],
    ['2', '48 kB', 'Not downloaded'],
    ['3', '3.4 MB', 'Downloaded'],
    ['4', '760 kB', 'Not downloaded'],
  ])
  expect(cells(wrapper)[3]?.[2]).toBe('No date')
  expect(wrapper.get('.logs-used').text()).toBe('Logs: 4. Together: 5.4 MB')
})

it('does not download on its own: every log is where it was until the button is pressed', async () => {
  const { wrapper, handle } = await screen()
  await flushPromises()

  expect(handle.logs.running.value).toBe(false)
  expect(wrapper.get('#logs-download').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#logs-download').text()).toBe('Download selected: 0')
})

it('selects the new logs, leaves a downloaded one without a box to tick, and downloads the selected', async () => {
  const { wrapper } = await screen()
  await wrapper.findAll('.logs-toolbar button')[1]?.trigger('click')

  const boxes = wrapper.findAll('tbody input[type="checkbox"]')
  expect(boxes.map(box => (box.element as HTMLInputElement).checked)).toEqual([true, true, false, true])
  expect(boxes[2]?.attributes('disabled')).toBeDefined()
  expect(wrapper.get('#logs-download').text()).toBe('Download selected: 3')
  await wrapper.get('#logs-download').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('#logs-outcome').text()).toBe('Download finished. Downloaded: 3'))

  expect(cells(wrapper).map(row => row[4])).toEqual(['Downloaded', 'Downloaded', 'Downloaded', 'Downloaded'])
})

it('shows a bar and the percent for the log being fetched, and offers to cancel', async () => {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, logs: { steps: 4, intervalMs: 30 }, control }))
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  mounted = mount(LogsVehicle, { global: { plugins: [i18n] }, props: { section: 'vehicle' } })
  await flushPromises()
  handle.logs.toggle(1)
  void handle.logs.download()
  await vi.waitFor(() => expect(mounted?.find('[role="progressbar"]').exists()).toBe(true))

  expect(mounted.get('.logs-state-text').text()).toMatch(/^Downloading: \d+%$/u)
  expect(mounted.get('#logs-cancel').text()).toBe('Cancel download')
  await mounted.get('#logs-cancel').trigger('click')
  await vi.waitFor(() => expect(mounted?.get('#logs-outcome').text()).toMatch(/^Download stopped/u))
})

it('says why, and turns the buttons off, while the vehicle is armed', async () => {
  const { wrapper, handle } = await screen()
  handle.logs.selectNew()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('#logs-blocked').text()).toContain('The vehicle is armed')
  expect(wrapper.get('#logs-download').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeDefined()
})

it('counts a vehicle that is not known to be disarmed as armed, and says that is why', async () => {
  const { wrapper, handle } = await screen()
  handle.logs.selectNew()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 9000 } })
  await flushPromises()

  expect(wrapper.get('#logs-blocked').text()).toContain('not known whether the vehicle is disarmed')
  expect(wrapper.get('#logs-download').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeDefined()
})

it('puts the erase last in the page, and its note says it takes every log and needs a checked copy of each', async () => {
  const { wrapper } = await screen(true, { logs: ALL_CHECKED })
  const last = wrapper.get('.logs-vehicle').element.lastElementChild

  expect(last).toBe(wrapper.get('.logs-erase').element)
  expect(wrapper.get('.logs-erase p').text())
    .toBe(`Erases every log on the vehicle: 2. Only when each one has a copy on this computer ${
      'that was checked against the vehicle.'}`)
  expect(wrapper.get('#logs-erase').attributes('aria-describedby')).toBe(wrapper.get('.logs-erase p').attributes('id'))
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeUndefined()
})

it('erases on the second press only, which names the count and that each log has a checked copy', async () => {
  const { wrapper, handle } = await screen(true, { logs: ALL_CHECKED })
  const erase = wrapper.get('#logs-erase')
  await erase.trigger('click')

  expect(erase.text()).toBe('Confirm: erase all logs from the vehicle: 2. Each has a checked copy on this computer.')
  expect(handle.logs.logs.value).toHaveLength(2)
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now + 1000)
  await erase.trigger('click')
  await vi.waitFor(() => expect(wrapper.get('#logs-outcome').text()).toBe('Erased from the vehicle: 2.'))

  expect(cells(wrapper)).toEqual([])
})

it('keeps the erase off, and says how many logs have no checked copy, while there are any', async () => {
  const { wrapper, handle } = await screen()
  await handle.logs.erase()
  await flushPromises()

  expect(wrapper.get('.logs-erase p').text()).toBe(
    'Not every log has a checked copy yet: 3 of 4 do not. An erase takes every log on the vehicle, so download the rest first.',
  )
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeDefined()
  expect(handle.logs.logs.value).toHaveLength(4)
})

it('says there is nothing to erase on a vehicle with no logs, and keeps the button off', async () => {
  const { wrapper } = await screen(true, { logs: { steps: 2, intervalMs: 5, logs: [] } })

  expect(wrapper.get('.logs-erase p').text()).toBe('The vehicle has no logs, so there is nothing to erase.')
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeDefined()
})

it('keeps its status always in the page, empty until there is something to say', async () => {
  const { wrapper } = await screen()

  expect(wrapper.get('#logs-outcome').attributes('role')).toBe('status')
  expect(wrapper.get('#logs-outcome').text()).toBe('')
})

it('has its words in another language', async () => {
  setLanguage('de')
  const { wrapper } = await screen()

  expect(wrapper.get('.logs-vehicle').attributes('aria-label')).toBe('Logs auf dem Fahrzeug')
  expect(wrapper.find('.logs-vehicle-title').exists()).toBe(false)
})

it('says the logs are not available yet, with no controls, when the backend has no logs methods', async () => {
  const { wrapper } = await screen(true, { withoutLogs: true })

  expect(wrapper.get('.kit-empty .title').text()).toBe('Logs on the vehicle are not available yet')
  expect(wrapper.find('#logs-error').exists()).toBe(false)
  expect(wrapper.findAll('button')).toHaveLength(0)
  expect(wrapper.find('table').exists()).toBe(false)
})

it('writes sizes with the decimal sign of the language', async () => {
  setLanguage('de')
  const { wrapper } = await screen()

  expect(wrapper.get('.logs-used').text()).toBe('Logs: 4. Zusammen: 5,4 MB')
})

it('reads the list again when the erase is armed, so that the counts it names are the vehicle\'s now', async () => {
  const { wrapper, handle } = await screen(true, { logs: ALL_CHECKED })
  const refresh = vi.spyOn(handle.logs, 'refresh')
  await wrapper.get('#logs-erase').trigger('click')

  expect(refresh).toHaveBeenCalledTimes(1)
})

it('shows no log as downloading or queued after a cancel', async () => {
  // Slow steps: log 1 is being fetched (a bar), logs 2 and 4 are queued, when the cancel comes.
  const { wrapper, handle } = await screen(true, { logs: { steps: 4, intervalMs: 30 } })
  handle.logs.selectNew()
  const first = handle.logs.download()
  // Waits for the state it then asserts (the bar and the first row's words, and the others queued), not for the bar alone.
  await vi.waitFor(() => {
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
    const states = cells(wrapper).map(row => row[4] ?? '')
    expect(states).toEqual([expect.stringMatching(/^Downloading/u), 'Queued', 'Downloaded', 'Queued'])
  })
  await handle.logs.cancel()
  await first
  await flushPromises()

  expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  expect(cells(wrapper).map(row => row[4] ?? '')).toEqual(['Not downloaded', 'Not downloaded', 'Downloaded', 'Not downloaded'])
})

it('shows no date where the vehicle gives none, and the time of the last change where it does', async () => {
  const { wrapper } = await screen()

  expect(cells(wrapper).map(row => row[2] === 'No date')).toEqual([false, true, true, true])
  // And says why, once: the firmware does not say.
  expect(wrapper.findAll('.logs-nodate')).toHaveLength(1)
  expect(wrapper.get('.logs-nodate').text()).toContain('firmware does not say when a file was last changed')
})

it('says the app does not erase when the backend cannot erase, and keeps its button off', async () => {
  const { wrapper } = await screen(true, { logs: { ...ALL_CHECKED, canErase: false } })

  expect(wrapper.get('.logs-erase p').text()).toBe(
    'This vehicle has no file transfer, so its logs can\'t be checked, and the app does not erase them.',
  )
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeDefined()
})

it('shows a vehicle with no file transfer: the log protocol is said, a copy is not checked, nothing can be erased', async () => {
  const { wrapper, handle } = await screen(true, { logs: { steps: 2, intervalMs: 5, source: 'mavlink' } })

  expect(wrapper.get('#logs-protocol').text()).toContain('no file transfer')
  handle.logs.selectNew()
  await handle.logs.download()
  await flushPromises()

  expect(cells(wrapper).map(row => row[4])).toEqual([
    'Not checked (no checksum)', 'Not checked (no checksum)', 'Not checked (no checksum)', 'Not checked (no checksum)',
  ])
  expect(wrapper.findAll('tbody input[type="checkbox"]').every(box => box.attributes('disabled') !== undefined)).toBe(true)
  expect(wrapper.get('#logs-erase').attributes('disabled')).toBeDefined()
})

it('does not say anything of the log protocol for a vehicle with file transfer', async () => {
  const { wrapper } = await screen()

  expect(wrapper.find('#logs-protocol').exists()).toBe(false)
})

it('shows the reason a download stopped, and the progress of the log that failed is gone', async () => {
  const { wrapper, handle } = await screen(true, { logs: { steps: 2, intervalMs: 5, failId: 2 } })
  handle.logs.selectNew()
  await handle.logs.download()
  await flushPromises()

  expect(wrapper.get('#logs-error').text()).toBe('log 2: the copy does not match the vehicle\'s file')
  expect(cells(wrapper).map(row => row[4] ?? '')).toEqual(['Downloaded', 'Not downloaded', 'Downloaded', 'Not downloaded'])
})
