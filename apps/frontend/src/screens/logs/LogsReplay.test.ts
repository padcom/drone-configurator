// "Replay": a flight of the logs on this computer on the map. The log is chosen from a menu (never a list that changes its
// value as keys move over it) and read; then its path is drawn (flown solid, ahead dashed), the vehicle moves with the
// scrubber, home is marked, and a gap in the fixes holds the last fix and says so. A log with no position says why and draws
// nothing; a log that is not verified is not looked into; a recording is marked as imported. The backend is the mock (the
// track's rules are the backend's own: backend/localtrack.test.pi).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import LogsReplay from './LogsReplay.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** The mock's logs: 3 has a track (with a gap in its fixes), 1 has no position, 2 is not verified; the recording has a track. */
const WITH_TRACK = 'uid-mock/00000003-1a2b3c4d.BIN'
const WITHOUT = 'uid-mock/00000001-1a2b3c4d.BIN'
const NOT_VERIFIED = 'uid-mock/00000002-1a2b3c4d.BIN'
const RECORDING = 'imported/00000000-5eed5eed.tlog'

/**
 * The screen over the mock, with the list of logs read.
 *
 * @returns the wrapper and the handle
 */
async function screen() {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 1 }))
  await flushPromises()
  mounted = mount(LogsReplay, { global: { plugins: [i18n] }, props: { section: 'replay' }, attachTo: document.body })
  await vi.waitFor(() => expect(handle.flights.listed.value).toBe(true))
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Opens a log and waits until the screen has what it needs of it.
 *
 * @param handle the configurator
 * @param key the log
 */
async function open(handle: ReturnType<typeof createConfigurator>, key: string): Promise<void> {
  void handle.replay.choose(key)
  await vi.waitFor(() => expect(['ready', 'none', 'unverified', 'failed']).toContain(handle.replay.phase.value))
  await flushPromises()
}

/**
 * Moves the scrubber to a moment.
 *
 * @param wrapper the screen
 * @param seconds the moment
 */
async function scrubTo(wrapper: VueWrapper, seconds: number): Promise<void> {
  await wrapper.get('#replay-scrub').setValue(seconds)
  await flushPromises()
}

it('has the map and says that no flight is chosen, with the logs in a menu', async () => {
  const { wrapper } = await screen()

  expect(wrapper.find('.replay-map .map').exists()).toBe(true)
  expect(wrapper.get('#replay-idle .title').text()).toBe('No flight chosen')
  expect(wrapper.get('#replay-log button').text()).toContain('Choose a flight')
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.find('.map-vehicle').exists()).toBe(false)
})

it('opens the log that is chosen in the menu', async () => {
  const { wrapper, handle } = await screen()

  await wrapper.get('#replay-log button').trigger('click')
  const items = wrapper.findAll('#replay-log [role="menuitem"]')
  await items.find(item => item.text().startsWith('3'))?.trigger('click')
  await vi.waitFor(() => expect(handle.replay.phase.value).toBe('ready'))
  await flushPromises()

  expect(handle.replay.open.value).toBe(WITH_TRACK)
  expect(wrapper.get('#replay-log button').text()).toContain('Flight: 3')
})

it('draws the path ahead dashed, home and the vehicle at the start, and says how many positions were not places', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)

  expect(wrapper.find('.map-ahead').exists()).toBe(true)
  // At the start nothing has been flown: no solid path, and the vehicle is at the first fix.
  expect(wrapper.find('.map-trail').exists()).toBe(false)
  expect(Number(wrapper.get('.map-vehicle').attributes('data-lat'))).toBeCloseTo(47.5 + 150 / 111195, 4)
  expect(wrapper.find('.map-home').exists()).toBe(true)
  expect(wrapper.get('#replay-facts').text()).toContain('Positions from the vehicle')
  expect(wrapper.get('#replay-skipped').text()).toContain('not drawn: 3')
  expect(wrapper.find('#replay-no-home').exists()).toBe(false)
})

it('moves the vehicle and the flown path with the scrubber, without asking the backend for anything', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)
  const before = handle.replay.phase.value

  await scrubTo(wrapper, 30)

  expect(wrapper.find('.map-trail').exists()).toBe(true)
  expect(wrapper.find('.map-ahead').exists()).toBe(true)
  expect(wrapper.get('#replay-clock').text()).toBe('0:30 of 2:00')
  // (it did not go to loading: no pass over the file)
  expect(handle.replay.phase.value).toBe(before)
  const lat = Number(wrapper.get('.map-vehicle').attributes('data-lat'))
  await scrubTo(wrapper, 31)
  expect(Number(wrapper.get('.map-vehicle').attributes('data-lat'))).not.toBe(lat)
})

it('holds the last fix in a gap of the positions, as one that is old, and says the speed is not known there', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)

  await scrubTo(wrapper, 30)
  expect(wrapper.get('#replay-tile-speed dd').text()).toMatch(/\d+\.\d m\/s/u)
  await scrubTo(wrapper, 48)

  expect(wrapper.get('.map-vehicle').classes()).toContain('stale')
  expect(wrapper.get('.map-vehicle .map-stale-label').text()).toContain('9 s')
  expect(wrapper.get('#replay-tile-speed dd').text()).toBe('–')
})

it('names the mode once, in the strip under the cursor (not again in a tile), and has the height and the battery', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)

  await scrubTo(wrapper, 30)
  expect(wrapper.get('.flight-mode.cursor .flight-mode-name').text()).toBe('Guided')
  expect(wrapper.find('#replay-tile-mode').exists()).toBe(false)
  expect(wrapper.get('#replay-tile-height dd').text()).not.toBe('–')
  expect(wrapper.get('#replay-tile-battery dd').text()).toMatch(/V$/u)
})

it('plays and pauses, and marks the speed that is in use', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)

  expect(wrapper.get('#replay-play').text()).toBe('Play')
  expect(wrapper.get('.replay-speed[data-speed="1"]').attributes('aria-pressed')).toBe('true')
  await wrapper.get('.replay-speed[data-speed="4"]').trigger('click')
  expect(wrapper.get('.replay-speed[data-speed="4"]').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.replay-speed[data-speed="1"]').attributes('aria-pressed')).toBe('false')
  await wrapper.get('#replay-play').trigger('click')
  expect(wrapper.get('#replay-play').text()).toBe('Pause')
  await wrapper.get('#replay-play').trigger('click')
  expect(wrapper.get('#replay-play').text()).toBe('Play')
})

it('jumps to the events of the flight, the vehicle\'s own words as text', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)

  const jumps = wrapper.findAll('.replay-jump').map(button => button.text())
  expect(jumps.some(text => text.includes('Armed'))).toBe(true)
  expect(jumps.some(text => text.includes('Failsafe: radio'))).toBe(true)
  expect(jumps.some(text => text.includes('Disarmed'))).toBe(true)
  await wrapper.findAll('.replay-jump').find(button => button.text().includes('Failsafe'))?.trigger('click')
  await flushPromises()

  expect(wrapper.get('#replay-clock').text()).toBe('1:20 of 2:00')
  expect((wrapper.get('#replay-scrub').element as HTMLInputElement).value).toBe('80')
})

it('says why a log with no position cannot be shown, and draws nothing', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITHOUT)

  expect(handle.replay.phase.value).toBe('none')
  expect(wrapper.get('#replay-none').text()).toContain('This flight cannot be shown on a map')
  expect(wrapper.get('#replay-none').text()).toContain('no position')
  expect(wrapper.find('.map-vehicle').exists()).toBe(false)
  expect(wrapper.find('.map-ahead').exists()).toBe(false)
  expect(wrapper.find('#replay-scrub').exists()).toBe(false)
})

it('does not look into a log that is not verified', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, NOT_VERIFIED)

  expect(wrapper.find('#replay-not-verified').exists()).toBe(true)
  expect(wrapper.find('.map-vehicle').exists()).toBe(false)
  expect(handle.replay.track.value).toBeNull()
})

it('marks a recording as imported', async () => {
  const { wrapper, handle } = await screen()
  // (a recording is in the list once it was imported)
  await handle.flights.importFile()
  await vi.waitFor(() => expect(handle.flights.phase.value).toBe('ready'))
  await open(handle, RECORDING)

  expect(wrapper.find('#replay-imported-mark').exists()).toBe(true)
  expect(wrapper.find('.map-vehicle').exists()).toBe(true)
})

it('stops the clock when another log is chosen', async () => {
  const { wrapper, handle } = await screen()
  await open(handle, WITH_TRACK)
  await wrapper.get('#replay-play').trigger('click')
  expect(wrapper.get('#replay-play').text()).toBe('Pause')

  await open(handle, WITHOUT)

  expect(wrapper.find('#replay-play').exists()).toBe(false)
})

it('says its words in another language', async () => {
  setLanguage('pl')
  const { wrapper } = await screen()

  expect(wrapper.get('#replay-idle .title').text()).toBe('Nie wybrano lotu')
})
