// The map in a window of jsdom: the credit as a link on the map, pan and zoom by the buttons, the keys, the wheel and a drag, the
// tiles asked of the backend for what is on screen (and not for what left it, or when the tiles are switched off), and the line
// that says why there are none. The canvas is not drawn on (jsdom has none): what is drawn is the loader's and the geometry's.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetMapView } from '@/composables/useFlightMap'
import type { MapSource } from '@/lib/map/mapSource'
import type { VehicleMark } from '@/lib/map/track'
import { mockBackend } from '@/mock/mock-backend'
import { withI18n } from '@/testing/testing'
import FlightMap from './FlightMap.vue'

let mounted: VueWrapper | undefined
const sizes = { width: 800, height: 600 }

beforeEach(() => {
  forgetMapView()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(sizes.width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(sizes.height)
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ close: () => undefined }))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/**
 * The map on a Configurator whose backend gives a tile for every ask (and whose asks are counted).
 *
 * @param source what goes over the map, if anything
 * @returns the map, the Configurator and the asks
 */
async function map(source?: MapSource) {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000 }))
  const tile = vi.spyOn(handle.map, 'tile').mockResolvedValue({ bytes: new Uint8Array([1]), contentType: 'image/png' })
  const cancel = vi.spyOn(handle.map, 'cancelTile').mockImplementation(() => undefined)
  mounted = mount(FlightMap, { ...withI18n, props: { source } })
  await flushPromises()

  return { wrapper: mounted, handle, tile, cancel }
}

/**
 * A pointer event on the map, as the browser sends it (jsdom has the mouse event; the pointer's own fields are put on it).
 *
 * @param element the element the pointer is on
 * @param type the event
 * @param at where the pointer is
 * @param at.x the column
 * @param at.y the row
 */
function pointer(element: Element, type: string, at: { x: number, y: number }): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: at.x, clientY: at.y })
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
  element.dispatchEvent(event)
}

/**
 * What the map says of its view.
 *
 * @param wrapper the map
 * @returns the zoom, the latitude and the longitude
 */
function viewOf(wrapper: VueWrapper): { zoom: number, lat: number, lon: number } {
  const box = wrapper.get('.map')

  const [zoom, lat, lon] = ['zoom', 'lat', 'lon'].map(name => Number(box.attributes(`data-${name}`)))

  return { zoom: zoom ?? 0, lat: lat ?? 0, lon: lon ?? 0 }
}

it('credits OpenStreetMap on the map, as a link the system browser opens, and keeps it there', async () => {
  const { wrapper } = await map()
  const link = wrapper.get('a#map-attribution')

  expect(link.text()).toBe('© OpenStreetMap contributors')
  expect(link.attributes('href')).toBe('https://www.openstreetmap.org/copyright')
  expect(link.attributes('target')).toBe('_blank')
  expect(link.attributes('rel')).toContain('noopener')
  expect(wrapper.get('.map').element.contains(link.element)).toBe(true)
})

it('has the line about the tiles in the page all the time, a live region that is empty while the tiles are fine', async () => {
  const { wrapper } = await map()
  const chip = wrapper.get('#map-chip')

  expect(chip.attributes('role')).toBe('status')
  expect(chip.text()).toBe('')
})

it('is a labelled region that the keyboard can reach, with its help said to a screen reader', async () => {
  const { wrapper } = await map()
  const box = wrapper.get('.map')

  expect(box.attributes('role')).toBe('application')
  expect(box.attributes('aria-label')).toBe('Map')
  expect(box.attributes('tabindex')).toBe('0')
  expect(wrapper.get(`#${box.attributes('aria-describedby')}`).text()).toContain('arrow keys')
  expect(wrapper.get('#map-zoom-in').attributes('aria-label')).toBe('Zoom in')
  expect(wrapper.get('#map-zoom-out').attributes('aria-label')).toBe('Zoom out')
})

it('zooms with the buttons, the keys and the wheel (a notch is one zoom), and stops at the ends', async () => {
  const { wrapper } = await map()
  const start = viewOf(wrapper).zoom
  await wrapper.get('#map-zoom-in').trigger('click')
  expect(viewOf(wrapper).zoom).toBe(start + 1)
  await wrapper.get('.map').trigger('keydown', { key: '-' })
  expect(viewOf(wrapper).zoom).toBe(start)
  await wrapper.get('.map').trigger('keydown', { key: '+', ctrlKey: true })
  expect(viewOf(wrapper).zoom).toBe(start)
  await wrapper.get('.map').trigger('wheel', { deltaY: -100 })
  await wrapper.get('.map').trigger('wheel', { deltaY: -100 })
  expect(viewOf(wrapper).zoom).toBe(start + 1)

  for (let i = 0; i < 25; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- one press after the other
    await wrapper.get('.map').trigger('keydown', { key: '=' })
  }

  expect(viewOf(wrapper).zoom).toBe(19)
  expect(wrapper.get('#map-zoom-in').attributes('disabled')).toBeDefined()
})

it('moves with the arrow keys, and with a drag that the map follows, but not with a drag that began on a button', async () => {
  const { wrapper } = await map()
  const before = viewOf(wrapper)
  await wrapper.get('.map').trigger('keydown', { key: 'ArrowRight' })

  expect(viewOf(wrapper).lon).toBeGreaterThan(before.lon)
  const now = viewOf(wrapper)
  pointer(wrapper.get('.map').element, 'pointerdown', { x: 100, y: 100 })
  pointer(wrapper.get('.map').element, 'pointermove', { x: 160, y: 100 })
  pointer(wrapper.get('.map').element, 'pointerup', { x: 160, y: 100 })
  await flushPromises()

  expect(viewOf(wrapper).lon).toBeLessThan(now.lon)
  const dragged = viewOf(wrapper)
  pointer(wrapper.get('#map-zoom-in').element, 'pointerdown', { x: 10, y: 10 })
  pointer(wrapper.get('.map').element, 'pointermove', { x: 300, y: 10 })
  await flushPromises()

  expect(viewOf(wrapper).lon).toBe(dragged.lon)
})

it('asks the backend for the tiles of the screen, the nearest first, and cancels those that left it', async () => {
  const { tile, cancel, wrapper } = await map()

  expect(tile).toHaveBeenCalled()
  expect(tile.mock.calls.every(([z]) => z === 2)).toBe(true)
  expect(tile.mock.calls.length).toBeLessThanOrEqual(6 + 12)
  await wrapper.get('#map-zoom-in').trigger('click')
  await flushPromises()

  expect(tile.mock.calls.some(([z]) => z === 3)).toBe(true)
  expect(cancel.mock.calls.length + tile.mock.calls.filter(([z]) => z === 2).length).toBeGreaterThan(0)
})

it('asks for nothing, and says so in words, when the tiles are switched off in the settings', async () => {
  const { handle, tile, wrapper } = await map()
  await flushPromises()
  const asked = tile.mock.calls.length
  await handle.map.choose('map.enabled', 'false')
  await flushPromises()

  expect(wrapper.get('#map-chip').text()).toContain('switched off')
  await wrapper.get('#map-zoom-in').trigger('click')
  await flushPromises()
  expect(tile.mock.calls.filter(([z]) => z === 3)).toHaveLength(0)
  expect(tile.mock.calls.length).toBeGreaterThanOrEqual(asked)
})

it('says why there are no tiles when the backend refuses them, once, in the one line', async () => {
  const { handle, tile, wrapper } = await map()
  tile.mockRejectedValue(Object.assign(new Error('offline'), { code: 'OFFLINE_MISS' }))
  await handle.map.choose('map.offline', 'true')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.get('#map-chip').text()).not.toBe(''))

  expect(wrapper.findAll('#map-chip')).toHaveLength(1)
  expect(wrapper.get('#map-chip').text()).toContain('Offline')
  expect(wrapper.find('a#map-attribution').exists()).toBe(true)
})

/**
 * A source whose vehicle the test moves.
 *
 * @param first where the vehicle is to begin with
 * @returns the source and its vehicle
 */
function vehicleSource(first: VehicleMark | null) {
  const vehicle = ref<VehicleMark | null>(first)
  const source: MapSource = { kind: 'live', vehicle, home: ref(null), trail: ref([]) }

  return { source, vehicle }
}

const HERE: VehicleMark = { lat: 47.397742, lon: 8.545594, ageMs: 100, stale: false }

it('has no buttons that follow the vehicle when it draws no vehicle, and has them off while there is no position', async () => {
  expect((await map()).wrapper.find('#map-follow').exists()).toBe(false)
  mounted?.unmount()
  const { wrapper } = await map(vehicleSource(null).source)

  expect(wrapper.get('#map-follow').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#map-centre').attributes('disabled')).toBeDefined()
})

it('takes the map to the vehicle close enough to see it, and follows it as it moves', async () => {
  const { source, vehicle } = vehicleSource(HERE)
  const { wrapper } = await map(source)

  expect(viewOf(wrapper).zoom).toBe(16)
  expect(viewOf(wrapper).lat).toBeCloseTo(47.397742, 5)
  expect(wrapper.get('#map-follow').attributes('aria-pressed')).toBe('true')
  vehicle.value = { ...HERE, lat: 47.398742, lon: 8.546594 }
  await flushPromises()

  expect(viewOf(wrapper).lat).toBeCloseTo(47.398742, 5)
  expect(viewOf(wrapper).lon).toBeCloseTo(8.546594, 5)
  expect(viewOf(wrapper).zoom).toBe(16)
})

it('stops following when the map is dragged, and goes to the vehicle again with the centre button', async () => {
  const { source, vehicle } = vehicleSource(HERE)
  const { wrapper } = await map(source)
  pointer(wrapper.get('.map').element, 'pointerdown', { x: 100, y: 100 })
  pointer(wrapper.get('.map').element, 'pointermove', { x: 220, y: 100 })
  pointer(wrapper.get('.map').element, 'pointerup', { x: 220, y: 100 })
  await flushPromises()

  expect(wrapper.get('#map-follow').attributes('aria-pressed')).toBe('false')
  const dragged = viewOf(wrapper)
  vehicle.value = { ...HERE, lat: 47.4 }
  await flushPromises()
  expect(viewOf(wrapper)).toEqual(dragged)
  await wrapper.get('#map-centre').trigger('click')

  expect(viewOf(wrapper).lat).toBeCloseTo(47.4, 5)
  expect(wrapper.get('#map-follow').attributes('aria-pressed')).toBe('true')
})

it('turns following on and off with the follow button, and centres when it turns it on', async () => {
  const { wrapper } = await map(vehicleSource(HERE).source)
  await wrapper.get('#map-follow').trigger('click')

  expect(wrapper.get('#map-follow').attributes('aria-pressed')).toBe('false')
  await wrapper.get('#map-follow').trigger('click')
  expect(wrapper.get('#map-follow').attributes('aria-pressed')).toBe('true')
})
