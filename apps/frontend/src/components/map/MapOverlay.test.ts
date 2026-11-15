// What goes over the map: the vehicle (an arrow that heads the way it does, hatched with "last heard" when its position is old,
// none without one), home, and the path; each marker says where it is, in words and in `data-lat` and `data-lon`.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { LatLon, VehicleMark } from '@/lib/map/track'
import type { MapSource } from '@/lib/map/mapSource'
import { withI18n } from '@/testing/testing'
import MapOverlay from './MapOverlay.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

const SIZE = { width: 800, height: 600 }
const HERE: VehicleMark = { lat: 47.397742, lon: 8.545594, heading: 90, height: 12.4, ageMs: 200, stale: false }

/**
 * The overlay over a source whose parts the test sets.
 *
 * @param parts the vehicle, home and the path
 * @param parts.vehicle the vehicle
 * @param parts.home home
 * @param parts.trail the path
 * @returns the overlay
 */
function overlay(parts: { vehicle?: VehicleMark | null, home?: LatLon | null, trail?: LatLon[] }): VueWrapper {
  const source: MapSource = {
    kind: 'live',
    vehicle: ref(parts.vehicle ?? null),
    home: ref(parts.home ?? null),
    trail: ref(parts.trail ?? []),
  }
  const place = (lat: number, lon: number) => ({ x: 400 + (lon - 8.545594) * 100_000, y: 300 - (lat - 47.397742) * 100_000 })
  mounted = mount(MapOverlay, { ...withI18n, props: { source, place, size: SIZE } })

  return mounted
}

it('draws nothing without a position, a home or a path', () => {
  const wrapper = overlay({})

  expect(wrapper.find('.map-vehicle').exists()).toBe(false)
  expect(wrapper.find('.map-home').exists()).toBe(false)
  expect(wrapper.find('.map-trail').exists()).toBe(false)
})

it('draws the vehicle where it is, pointing the way it heads, and says so in words and in data', () => {
  const marker = overlay({ vehicle: HERE }).get('.map-vehicle')

  expect(marker.attributes('data-lat')).toBe('47.397742')
  expect(marker.attributes('data-lon')).toBe('8.545594')
  expect(marker.attributes('data-heading')).toBe('90')
  expect(marker.attributes('data-stale')).toBe('false')
  expect(marker.attributes('transform')).toBe('translate(400 300)')
  expect(marker.attributes('role')).toBe('img')
  expect(marker.attributes('aria-label')).toBe('Vehicle at 47.39774, 8.54559, heading 90 degrees, 12 m above home')
  expect(marker.find('path').exists()).toBe(true)
  expect(marker.find('.map-stale-label').exists()).toBe(false)
})

it('draws a dot when the vehicle does not say where it heads', () => {
  const marker = overlay({ vehicle: { ...HERE, heading: undefined } }).get('.map-vehicle')

  expect(marker.find('path').exists()).toBe(false)
  expect(marker.find('circle').exists()).toBe(true)
  expect(marker.attributes('aria-label')).toBe('Vehicle at 47.39774, 8.54559, 12 m above home')
})

it('hatches the vehicle and says when it was heard last when its position is old', () => {
  const marker = overlay({ vehicle: { ...HERE, ageMs: 5400, stale: true } }).get('.map-vehicle')

  expect(marker.classes()).toContain('stale')
  expect(marker.attributes('data-stale')).toBe('true')
  expect(marker.get('.map-stale-label').text()).toBe('last heard 5 s ago')
  expect(marker.attributes('aria-label')).toContain('last heard 5 s ago')
  expect(marker.get('path').attributes('fill')).toMatch(/^url\(#.*-old\)$/u)
})

it('draws home with its place, and the path as a line through its points', () => {
  const wrapper = overlay({
    home: { lat: 47.397742, lon: 8.545594 },
    trail: [{ lat: 47.397742, lon: 8.545594 }, { lat: 47.397842, lon: 8.545594 }, { lat: 47.397942, lon: 8.545694 }],
  })
  const home = wrapper.get('.map-home')

  expect(home.text()).toBe('H')
  expect(home.attributes('data-lat')).toBe('47.397742')
  expect(home.attributes('aria-label')).toBe('Home at 47.39774, 8.54559')
  expect((wrapper.get('.map-trail').attributes('points') ?? '').split(' ')).toHaveLength(3)
})

it('draws no line for a path of one point', () => {
  expect(overlay({ trail: [{ lat: 47.397742, lon: 8.545594 }] }).find('.map-trail').exists()).toBe(false)
})
