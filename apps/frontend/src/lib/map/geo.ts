// The map's geometry: Web Mercator ("slippy map") tiles of 256 px, a view that is a centre and a whole zoom, and what is on
// screen for it. Pure functions, no DOM: the engine's tests need no window. A world pixel is a pixel of the whole map at a zoom
// (the world is `256 * 2^zoom` wide and high); the longitude wraps round (the antimeridian), the latitude is cut at the poles
// that the projection cannot show.

/** The size of a tile (px). */
export const TILE = 256

/** The least zoom the backend serves. */
export const MIN_ZOOM = 0

/** The most zoom the backend serves. */
export const MAX_ZOOM = 19

/** The latitude where the projection ends (a square world). */
export const MAX_LAT = 85.0511287798

/** What the map shows: its centre and a whole zoom. */
export interface View {
  /** The latitude of the centre (degrees). */
  lat: number
  /** The longitude of the centre (degrees). */
  lon: number
  /** The zoom (a whole number from MIN_ZOOM to MAX_ZOOM). */
  zoom: number
}

/** A point in screen pixels, from the top left of the map. */
export interface Point {
  /** The column. */
  x: number
  /** The row. */
  y: number
}

/** The size of the map on screen (px). */
export interface Size {
  /** Its width. */
  width: number
  /** Its height. */
  height: number
}

/** A tile on screen: which, and where its top left corner is. */
export interface TilePlace {
  /** The zoom. */
  z: number
  /** The column, wrapped into the zoom's range. */
  x: number
  /** The row. */
  y: number
  /** Where its left edge is on screen (px). */
  left: number
  /** Where its top edge is on screen (px). */
  top: number
}

/**
 * A number held between two ends.
 *
 * @param n the number
 * @param low the least
 * @param high the most
 * @returns the number, or the end it is beyond
 */
export function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n))
}

/**
 * The size of the world at a zoom.
 *
 * @param zoom the zoom
 * @returns pixels, on a side
 */
export function worldSize(zoom: number): number {
  return TILE * 2 ** zoom
}

/**
 * A longitude brought into -180 to 180 (the world wraps round).
 *
 * @param lon the longitude
 * @returns the same meridian within the range
 */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

/**
 * Where a position is in the world's pixels at a zoom.
 *
 * @param lat the latitude (degrees)
 * @param lon the longitude (degrees)
 * @param zoom the zoom
 * @returns the pixel from the top left of the world
 */
export function project(lat: number, lon: number, zoom: number): Point {
  const size = worldSize(zoom)
  const sin = Math.sin((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180)

  return { x: ((wrapLon(lon) + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size }
}

/**
 * The position of a pixel of the world: the other way of `project`.
 *
 * @param x the pixel's column
 * @param y the pixel's row
 * @param zoom the zoom
 * @returns the latitude and the longitude
 */
export function unproject(x: number, y: number, zoom: number): { lat: number, lon: number } {
  const size = worldSize(zoom)
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI

  return { lat: clamp(lat, -MAX_LAT, MAX_LAT), lon: wrapLon((x / size) * 360 - 180) }
}

/**
 * The view that has a world pixel in its centre.
 *
 * @param center the pixel
 * @param zoom the zoom
 * @returns the view (the centre kept inside the world)
 */
function viewAt(center: Point, zoom: number): View {
  const { lat, lon } = unproject(center.x, clamp(center.y, 0, worldSize(zoom)), zoom)

  return { lat, lon, zoom }
}

/**
 * The view after the map was dragged: the map follows the pointer, so the centre moves the other way.
 *
 * @param view the view
 * @param dx how far the pointer moved to the right (px)
 * @param dy how far the pointer moved down (px)
 * @returns the new view
 */
export function panView(view: View, dx: number, dy: number): View {
  const center = project(view.lat, view.lon, view.zoom)

  return viewAt({ x: center.x - dx, y: center.y - dy }, view.zoom)
}

/**
 * The view after a zoom by steps that keeps the place under a point of the screen where it is.
 *
 * @param view the view
 * @param steps how many zooms (1 in, -1 out)
 * @param at the point of the screen that stays (the middle of the map for the keys and the buttons)
 * @param size the size of the map on screen
 * @returns the new view (the same one at the ends of the zoom range)
 */
export function zoomView(view: View, steps: number, at: Point, size: Size): View {
  const zoom = clamp(view.zoom + steps, MIN_ZOOM, MAX_ZOOM)
  if (zoom === view.zoom) {
    return view
  }
  const before = project(view.lat, view.lon, view.zoom)
  // the world point under `at`, in the new zoom's pixels; the centre is that point moved by how far `at` is from the middle
  const scale = 2 ** (zoom - view.zoom)
  const off = { x: at.x - size.width / 2, y: at.y - size.height / 2 }
  const under = { x: (before.x + off.x) * scale, y: (before.y + off.y) * scale }

  return viewAt({ x: under.x - off.x, y: under.y - off.y }, zoom)
}

/**
 * Where a position is on the screen (for what is drawn over the map: the markers and the trail).
 *
 * @param view the view
 * @param size the size of the map on screen
 * @param lat the latitude
 * @param lon the longitude
 * @returns the point on the screen (the nearest copy of the world, so that the antimeridian is no seam)
 */
export function screenOf(view: View, size: Size, lat: number, lon: number): Point {
  const center = project(view.lat, view.lon, view.zoom)
  const here = project(lat, lon, view.zoom)
  const world = worldSize(view.zoom)
  const dx = here.x - center.x

  return { x: size.width / 2 + dx - Math.round(dx / world) * world, y: size.height / 2 + (here.y - center.y) }
}

/** The room `fitView` leaves round the places (px). */
const FIT_MARGIN = 48

/** The box round some places (degrees). */
interface Extent {
  /** The southern edge. */
  south: number
  /** The northern edge. */
  north: number
  /** The western edge. */
  west: number
  /** The eastern edge. */
  east: number
}

/**
 * The box round some places.
 *
 * @param places the places (at least one)
 * @returns the box
 */
function extentOf(places: readonly { lat: number, lon: number }[]): Extent {
  const lats = places.map(place => place.lat)
  const lons = places.map(place => place.lon)

  return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons) }
}

/**
 * The view at a zoom that has a box in its middle, when the box fits the map with a margin there.
 *
 * @param box the box
 * @param zoom the zoom
 * @param room how many px the box may take, across and down
 * @returns the view, or null when the box does not fit
 */
function fittedAt(box: Extent, zoom: number, room: Size): View | null {
  const [top, bottom] = [project(box.north, box.west, zoom), project(box.south, box.east, zoom)]
  const fits = bottom.x - top.x <= room.width && bottom.y - top.y <= room.height

  return fits ? viewAt({ x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 }, zoom) : null
}

/**
 * The view that shows all of some places: the whole zoom at which they fit the map with a margin, centred on them (no zoom
 * closer than `maxZoom`: one place, or places a few metres apart, are shown at the zoom of a vehicle). The antimeridian is not
 * crossed: a flight is a local thing.
 *
 * @param places the places (degrees)
 * @param size the size of the map on screen
 * @param maxZoom the closest zoom to use
 * @returns the view, or null for no place
 */
export function fitView(places: readonly { lat: number, lon: number }[], size: Size, maxZoom = 17): View | null {
  if (places.length === 0) {
    return null
  }
  const box = extentOf(places)
  const room = { width: size.width - 2 * FIT_MARGIN, height: size.height - 2 * FIT_MARGIN }
  const zooms = Array.from({ length: maxZoom - MIN_ZOOM }, (_, i) => maxZoom - i)

  return zooms.reduce<View | null>((found, zoom) => found ?? fittedAt(box, zoom, room), null)
    ?? { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2, zoom: MIN_ZOOM }
}

/**
 * The key of a tile.
 *
 * @param z the zoom
 * @param x the column
 * @param y the row
 * @returns a text that names it
 */
export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`
}

/**
 * How far the middle of a tile is from the middle of the map.
 *
 * @param place the tile
 * @param size the size of the map
 * @returns the squared distance (px)
 */
function distance(place: TilePlace, size: Size): number {
  return (place.left + TILE / 2 - size.width / 2) ** 2 + (place.top + TILE / 2 - size.height / 2) ** 2
}

/**
 * The whole numbers from one to another.
 *
 * @param first the first
 * @param last the last
 * @returns them, in order (none when the last is before the first)
 */
function span(first: number, last: number): number[] {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_unused, i) => first + i)
}

/**
 * The tiles that cover the screen, the ones nearest to the centre first (they are asked for first).
 *
 * @param view the view
 * @param size the size of the map on screen
 * @returns the tiles, with where each is drawn (none for rows beyond the poles)
 */
export function tilesIn(view: View, size: Size): TilePlace[] {
  const center = project(view.lat, view.lon, view.zoom)
  const origin = { x: center.x - size.width / 2, y: center.y - size.height / 2 }
  const count = 2 ** view.zoom
  const columns = span(Math.floor(origin.x / TILE), Math.floor((origin.x + size.width) / TILE))
  const rows = span(Math.max(0, Math.floor(origin.y / TILE)), Math.min(count - 1, Math.floor((origin.y + size.height) / TILE)))
  const places = rows.flatMap(row => columns.map(column => ({
    z: view.zoom,
    x: ((column % count) + count) % count,
    y: row,
    left: column * TILE - origin.x,
    top: row * TILE - origin.y,
  })))

  return places.sort((a, b) => distance(a, size) - distance(b, size))
}
