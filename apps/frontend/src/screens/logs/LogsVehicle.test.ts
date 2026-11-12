// "On the vehicle": the table, the selection, the download with the mock, and the safety register (no download on its own, none
// while armed or not known to be disarmed, erase as a second press that names what happens, and last).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
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
 * The screen with a vehicle connected and (unless told otherwise) known to be disarmed.
 *
 * @param connect whether to connect the vehicle
 * @returns the wrapper and the handle
 */
async function screen(connect = true) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, logs: { steps: 2, intervalMs: 5 }, control }))
  control.armed?.(false)

  if (connect) {
    await handle.vehicle.connect({ transport: 'simulator' })
    feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  }
  mounted = mount(LogsVehicle, { global: { plugins: [i18n] }, props: { section: 'vehicle' } })
  await flushPromises()

  return { wrapper: mounted, handle }
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

  expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['Select', 'Log', 'Date', 'Size', 'State'])
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

it('puts the erase last in the page, and its note counts what stays on the vehicle', async () => {
  const { wrapper } = await screen()
  const last = wrapper.get('.logs-vehicle').element.lastElementChild

  expect(last).toBe(wrapper.get('.logs-erase').element)
  expect(wrapper.get('.logs-erase p').text())
    .toBe('Erases only logs that were downloaded and checked: 1. The others stay on the vehicle: 3.')
  expect(wrapper.get('#logs-erase').attributes('aria-describedby')).toBe(wrapper.get('.logs-erase p').attributes('id'))
})

it('erases on the second press only, which names what happens, and keeps the logs not downloaded', async () => {
  const { wrapper, handle } = await screen()
  const erase = wrapper.get('#logs-erase')
  await erase.trigger('click')

  expect(erase.text()).toBe('Confirm: erase downloaded logs from the vehicle: 1. Not downloaded, and kept: 3')
  expect(handle.logs.logs.value).toHaveLength(4)
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now + 1000)
  await erase.trigger('click')
  await vi.waitFor(() => expect(wrapper.get('#logs-outcome').text())
    .toBe('Erased from the vehicle: 1. Kept, because not downloaded: 3'))

  expect(cells(wrapper).map(row => row[1])).toEqual(['1', '2', '4'])
})

it('says there is nothing to erase when no log is downloaded, and keeps the button off', async () => {
  const { wrapper, handle } = await screen()
  await handle.logs.erase()
  await flushPromises()

  expect(wrapper.get('.logs-erase p').text()).toBe('No log is downloaded yet, so there is nothing to erase.')
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

  expect(wrapper.get('.logs-vehicle-title').text()).toBe('Logs auf dem Fahrzeug')
})
