// What the map draws of the vehicle: no marker without a position or at (0, 0), an old position marked as old, a trail that
// ignores a vehicle standing still, is capped and thinned with its ends kept, and forgets when it is reset.
import { describe, expect, it } from 'vitest'
import { STALE_MS, TRAIL_CAP, Trail, drawable, markOf, metresBetween } from './track'

const HERE = { lat: 47.397742, lon: 8.545594 }

describe('a place the map may draw', () => {
  it('is a place on the earth, and never (0, 0), which is how a vehicle without a position says so', () => {
    expect(drawable(HERE)).toBe(true)
    expect(drawable({ lat: 0, lon: 8.5 })).toBe(true)
    expect(drawable({ lat: 0, lon: 0 })).toBe(false)
    expect(drawable({ lat: Number.NaN, lon: 1 })).toBe(false)
    expect(drawable({ lat: 91, lon: 1 })).toBe(false)
    expect(drawable({ lat: 1, lon: 181 })).toBe(false)
    expect(drawable(null)).toBe(false)
    expect(drawable(undefined)).toBe(false)
  })

  it('is measured in metres for steps of a few: a thousandth of a degree of latitude is 111 m', () => {
    expect(metresBetween(HERE, { lat: HERE.lat + 0.001, lon: HERE.lon })).toBeCloseTo(111.2, 0)
    expect(metresBetween(HERE, HERE)).toBe(0)
    // a degree of longitude is shorter away from the equator
    expect(metresBetween({ lat: 60, lon: 0 }, { lat: 60, lon: 0.001 })).toBeCloseTo(55.6, 0)
  })
})

describe('the vehicle marker', () => {
  it('is none without a position, and none at (0, 0)', () => {
    expect(markOf(undefined)).toBeNull()
    expect(markOf({ lat: 0, lon: 0, ageMs: 10 })).toBeNull()
  })

  it('has the heading and the height above home the vehicle gave, and is old only past three seconds', () => {
    const fresh = markOf({ ...HERE, heading: 90, relativeAltitude: 12.5, ageMs: STALE_MS })
    const old = markOf({ ...HERE, ageMs: STALE_MS + 1 })

    expect(fresh).toMatchObject({ ...HERE, heading: 90, height: 12.5, stale: false })
    expect(old).toMatchObject({ ...HERE, stale: true, ageMs: STALE_MS + 1 })
    expect(old?.heading).toBeUndefined()
  })
})

describe('the trail: adding', () => {
  it('adds the places the vehicle goes to, and not the same place again', () => {
    const trail = new Trail()

    expect(trail.add(HERE)).toBe(true)
    expect(trail.add({ lat: HERE.lat + 0.0000001, lon: HERE.lon })).toBe(false)
    expect(trail.add({ lat: HERE.lat + 0.0001, lon: HERE.lon })).toBe(true)
    expect(trail.all).toHaveLength(2)
  })

  it('takes no place that cannot be drawn', () => {
    const trail = new Trail()

    expect(trail.add({ lat: 0, lon: 0 })).toBe(false)
    expect(trail.all).toHaveLength(0)
  })

  it('is replaced, not changed, when a point comes (what is drawn from it follows)', () => {
    const trail = new Trail()
    trail.add(HERE)
    const before = trail.all
    trail.add({ lat: HERE.lat + 0.001, lon: HERE.lon })

    expect(trail.all).not.toBe(before)
    expect(before).toHaveLength(1)
  })
})

describe('the trail: its cap', () => {
  it('keeps at most its cap, thinned by dropping every second point, with the first and the last kept', () => {
    const trail = new Trail()
    for (let i = 0; i <= TRAIL_CAP; i += 1) {
      trail.add({ lat: 10 + i * 0.0001, lon: 20 })
    }

    expect(trail.all.length).toBeLessThanOrEqual(TRAIL_CAP)
    expect(trail.all.length).toBeGreaterThan(TRAIL_CAP / 2 - 1)
    expect(trail.all[0]?.lat).toBe(10)
    expect(trail.all.at(-1)?.lat).toBeCloseTo(10 + TRAIL_CAP * 0.0001, 9)
    const lats = trail.all.map(point => point.lat)

    expect(lats).toEqual([...lats].sort((a, b) => a - b))
  })

  it('forgets the path when it is reset', () => {
    const trail = new Trail()
    trail.add(HERE)
    trail.reset()

    expect(trail.all).toHaveLength(0)
    expect(trail.add(HERE)).toBe(true)
  })
})
