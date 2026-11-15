// The map's geometry: the projection and its inverse, the poles and the antimeridian, a drag and a zoom that keeps the place
// under the pointer, the tiles that cover a screen (wrapped, nearest first, none beyond the poles) and where a position is on
// screen.
import { describe, expect, it } from 'vitest'
import {
  MAX_LAT,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE,
  panView,
  project,
  screenOf,
  tileKey,
  tilesIn,
  unproject,
  worldSize,
  wrapLon,
  zoomView,
} from './geo'

const SIZE = { width: 800, height: 600 }

describe('the projection', () => {
  it('puts the origin of the map in the middle of the world, and the world a tile wide at zoom 0', () => {
    expect(worldSize(0)).toBe(TILE)
    expect(worldSize(3)).toBe(TILE * 8)
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 })
    expect(project(0, -180, 2)).toEqual({ x: 0, y: 512 })
  })

  it('gives back the position of a pixel it made from it, at every zoom, within a millimetre of the ground', () => {
    for (const zoom of [0, 5, 12, 19]) {
      const { x, y } = project(47.397742, 8.545594, zoom)
      const back = unproject(x, y, zoom)

      expect(back.lat).toBeCloseTo(47.397742, 8)
      expect(back.lon).toBeCloseTo(8.545594, 8)
    }
  })
})

describe('the ends of the world', () => {
  it('cuts the latitude where the projection ends, and wraps the longitude round the antimeridian', () => {
    expect(project(90, 0, 3).y).toBeCloseTo(0, 6)
    expect(project(-90, 0, 3).y).toBeCloseTo(worldSize(3), 6)
    expect(unproject(0, -10_000, 3).lat).toBe(MAX_LAT)
    expect(wrapLon(190)).toBe(-170)
    expect(wrapLon(-190)).toBe(170)
    expect(wrapLon(180)).toBe(-180)
    expect(project(0, 181, 2).x).toBeCloseTo(project(0, -179, 2).x, 9)
  })
})

const VIEW = { lat: 47.4, lon: 8.5, zoom: 10 }

describe('a drag', () => {
  const view = VIEW

  it('moves the map with the pointer: the centre goes the other way', () => {
    const moved = panView(view, 100, 0)

    expect(moved.lon).toBeLessThan(view.lon)
    expect(moved.lat).toBeCloseTo(view.lat, 6)
    expect(panView(moved, -100, 0).lon).toBeCloseTo(view.lon, 9)
    expect(panView(view, 0, 100).lat).toBeGreaterThan(view.lat)
  })

  it('does not drag the centre past a pole', () => {
    expect(panView({ lat: 80, lon: 0, zoom: 3 }, 0, 100_000).lat).toBeLessThanOrEqual(MAX_LAT)
    expect(panView({ lat: -80, lon: 0, zoom: 3 }, 0, -100_000).lat).toBeGreaterThanOrEqual(-MAX_LAT)
  })
})

describe('a zoom', () => {
  const view = VIEW

  it('zooms about the middle without moving the centre', () => {
    const first = zoomView(view, 1, { x: 400, y: 300 }, SIZE)

    expect(first.zoom).toBe(11)
    expect(first.lat).toBeCloseTo(view.lat, 6)
    expect(first.lon).toBeCloseTo(view.lon, 6)
  })

  it('zooms about a point so that the place under the point stays where it is', () => {
    const second = zoomView(view, 1, { x: 700, y: 100 }, SIZE)
    const centre = project(view.lat, view.lon, 10)
    // the place that was under (700, 100) is under it still
    const before = unproject(centre.x + 300, centre.y - 200, 10)
    const after = screenOf(second, SIZE, before.lat, before.lon)

    expect(after.x).toBeCloseTo(700, 4)
    expect(after.y).toBeCloseTo(100, 4)
  })

  it('stays where it is at the ends of the zoom range', () => {
    const top = { ...view, zoom: MAX_ZOOM }
    const bottom = { ...view, zoom: MIN_ZOOM }

    expect(zoomView(top, 1, { x: 1, y: 1 }, SIZE)).toBe(top)
    expect(zoomView(bottom, -1, { x: 1, y: 1 }, SIZE)).toBe(bottom)
  })
})

describe('the tiles of a screen', () => {
  it('covers the screen, the tile at the middle first, and names each by zoom, column and row', () => {
    const places = tilesIn({ lat: 47.4, lon: 8.5, zoom: 10 }, SIZE)
    const centre = project(47.4, 8.5, 10)
    const [first] = places
    const middle = `10/${Math.floor(centre.x / TILE)}/${Math.floor(centre.y / TILE)}`

    expect(places.length).toBeGreaterThanOrEqual(12)
    expect(places.length).toBeLessThanOrEqual(20)
    expect(first ? tileKey(first.z, first.x, first.y) : '').toBe(middle)
    expect(places.every(place => place.left + TILE > 0 && place.left < SIZE.width && place.top + TILE > 0)).toBe(true)
  })

  it('wraps the columns round the antimeridian and shows the one tile of zoom 0 as often as the screen holds it', () => {
    const wrapped = tilesIn({ lat: 0, lon: 179.9, zoom: 3 }, SIZE)
    const columns = new Set(wrapped.map(place => place.x))

    expect(columns.has(7) && columns.has(0)).toBe(true)
    expect(wrapped.every(place => place.x >= 0 && place.x < 8)).toBe(true)
    const world = tilesIn({ lat: 0, lon: 0, zoom: 0 }, SIZE)

    expect(world.every(place => place.x === 0 && place.y === 0)).toBe(true)
    expect(world.length).toBeGreaterThanOrEqual(3)
  })

  it('has no row beyond the poles', () => {
    const places = tilesIn({ lat: MAX_LAT, lon: 0, zoom: 4 }, SIZE)

    expect(places.every(place => place.y >= 0 && place.y < 16)).toBe(true)
    expect(Math.min(...places.map(place => place.y))).toBe(0)
  })
})

describe('where a position is on the screen', () => {
  it('puts the centre of the view in the middle of the screen, and north above south', () => {
    const view = { lat: 47.4, lon: 8.5, zoom: 12 }

    expect(screenOf(view, SIZE, 47.4, 8.5)).toEqual({ x: 400, y: 300 })
    expect(screenOf(view, SIZE, 47.41, 8.5).y).toBeLessThan(300)
    expect(screenOf(view, SIZE, 47.4, 8.51).x).toBeGreaterThan(400)
  })

  it('takes the copy of the world that is nearest, so that the antimeridian is no seam', () => {
    const view = { lat: 0, lon: 179.99, zoom: 6 }

    expect(Math.abs(screenOf(view, SIZE, 0, -179.99).x - 400)).toBeLessThan(10)
  })
})
