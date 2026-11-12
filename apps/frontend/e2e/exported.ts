// Readers for the files the app exports, written for the e2e checks. They are NOT the exporter's code (the backend is Pico,
// these are TypeScript): a CSV of numbers is split on its commas, a GPX is read by its `<trkpt>` tags, a KML by its
// `<coordinates>` list.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** A point of a track. */
export interface TrackPoint {
  /** Degrees north. */
  lat: number
  /** Degrees east. */
  lon: number
}

/**
 * The path of the file in a folder whose name ends with something.
 *
 * @param dir the folder
 * @param suffix the end of the name
 * @returns the path, undefined when there is none
 */
export function savedFile(dir: string, suffix: string): string | undefined {
  const name = readdirSync(dir).find(candidate => candidate.endsWith(suffix))

  return name === undefined ? undefined : join(dir, name)
}

/**
 * The rows of a CSV of numbers, as lists of cells (a file with no quotes in it).
 *
 * @param file the CSV's path
 * @returns the rows, the header first
 */
export function csvRows(file: string): string[][] {
  return readFileSync(file, 'utf8').split('\r\n').filter(line => line !== '').map(line => line.split(','))
}

/**
 * The points of a GPX track.
 *
 * @param gpx the file's text
 * @returns the points in order
 */
export function gpxPoints(gpx: string): TrackPoint[] {
  return [...gpx.matchAll(/<trkpt lat="(?<lat>-?[\d.]+)" lon="(?<lon>-?[\d.]+)">/gu)]
    .map(match => ({ lat: Number(match.groups?.lat), lon: Number(match.groups?.lon) }))
}

/**
 * The points of a KML line (longitude, latitude).
 *
 * @param kml the file's text
 * @returns the points in order
 */
export function kmlPoints(kml: string): TrackPoint[] {
  const list = /<coordinates>(?<list>[^<]*)<\/coordinates>/u.exec(kml)?.groups?.list ?? ''

  return list.trim().split(/\s+/u).filter(item => item !== '').map(item => {
    const [lon, lat] = item.split(',').map(Number)

    return { lat: lat ?? Number.NaN, lon: lon ?? Number.NaN }
  })
}

/**
 * Whether a point is a place on the globe that is not the null island.
 *
 * @param point the point
 * @returns true if it is
 */
export function isPlace(point: TrackPoint): boolean {
  const inside = Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180

  return inside && (point.lat !== 0 || point.lon !== 0)
}
